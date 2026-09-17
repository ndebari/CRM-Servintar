import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

// Compile the real quote builder with the project's TypeScript dependency.
const temp = await mkdtemp(fileURLToPath(new URL('./.quote-test-', import.meta.url)));
after(() => rm(temp, { recursive: true, force: true }));
const source = await readFile(new URL('../src/crmFeature.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
await writeFile(`${temp}/quote.mjs`, compiled.outputText);
const { calculateAdditionalAmount, calculateRouteDistance, createQuoteDraft, getTruckRouteKey, buildPreparedQuote, summarizeTolls, mergeRouteTolls } = await import(pathToFileURL(`${temp}/quote.mjs`).href);

function draftWithTolls(amount) {
  const draft = { ...createQuoteDraft('demo'), distanceKm: 100, requiredDays: 1, utilityPercent: 20, tolls: [{ id: 'a:0', name: 'Peaje prueba', locality: 'Localidad prueba', road: '', province: '', amount, source: 'manual' }], tollListStatus: 'manual', additionals: [{ id: '1', name: 'Demora', amount: 1000, discountPercent: 10 }] };
  draft.tollRouteKey = getTruckRouteKey(draft);
  return draft;
}
test('peajes are counted once before the margin and included in quote text', () => {
  const quote = buildPreparedQuote(draftWithTolls(12000), [], { perDay: 5000, perKm: 100 });
  assert.equal(quote.amount, (5000 + 100 * 100 + 900 + 12000) / 0.8);
  assert.match(quote.text, /Total peajes:/);
});
test('unknown or outdated tolls cannot produce a quote', () => {
  assert.throws(() => buildPreparedQuote(draftWithTolls(null), [], { perDay: 5000, perKm: 100 }));
  const changed = draftWithTolls(12000); changed.isRoundTrip = !changed.isRoundTrip;
  assert.throws(() => buildPreparedQuote(changed, [], { perDay: 5000, perKm: 100 }));
});
test('confirmed zero is valid and payment or dimensions do not change the Google route', () => {
  assert.equal(buildPreparedQuote(draftWithTolls(0), [], { perDay: 5000, perKm: 100 }).amount, 19875);
  const changed = draftWithTolls(100); changed.truck = { ...changed.truck, tractorAxles: 2 };
  assert.equal(getTruckRouteKey(changed), changed.tollRouteKey);
  const payment = draftWithTolls(100); payment.tollPayment = 'tag';
  assert.equal(getTruckRouteKey(payment), payment.tollRouteKey);
});

test('partial sum includes priced stations but prevents final quote', () => {
  const draft = draftWithTolls(100);
  draft.tolls.push({ ...draft.tolls[0], id: 'a:1', amount: null });
  assert.equal(summarizeTolls(draft).total, 100);
  assert.equal(summarizeTolls(draft).pending, 1);
  assert.equal(summarizeTolls(draft).ready, false);
  draft.tolls[1].amount = 200;
  assert.equal(summarizeTolls(draft).total, 300);
  assert.equal(summarizeTolls(draft).ready, true);
});
test('unknown empty list differs from a confirmed toll-free route', () => {
  const draft = draftWithTolls(0); draft.tolls = []; draft.tollListStatus = 'pending';
  assert.equal(summarizeTolls(draft).ready, false);
  draft.tollListStatus = 'detected'; assert.equal(summarizeTolls(draft).ready, true);
});
test('refresh preserves edits for each repeated station independently', () => {
  const first = draftWithTolls(100).tolls[0];
  const incoming = [{ ...first, source: 'automatic', amount: 200 }, { ...first, id: 'a:1', source: 'automatic', amount: null }];
  const merged = mergeRouteTolls(incoming, [first]);
  assert.equal(merged.length, 2); assert.equal(merged[0].amount, 100); assert.equal(merged[1].amount, null);
});


test('Google distance includes every leg, including the selected return', async () => {
  let request;
  globalThis.window = { google: { maps: { DirectionsService: class { route(input, callback) {
    request = input;
    callback({ routes: [{ legs: [{ distance: { value: 12000 } }, { distance: { value: 23000 } }, { distance: { value: 34000 } }] }] }, 'OK');
  } } } } };
  assert.equal(await calculateRouteDistance(['Base', 'Retiro', 'Puerto', 'Base']), 69);
  assert.deepEqual(request.waypoints, [{ location: 'Retiro', stopover: true }, { location: 'Puerto', stopover: true }]);
  assert.equal(request.destination, 'Base');
  assert.equal(request.travelMode, 'DRIVING');
  delete globalThis.window;
});

test('Google errors and incomplete distances never become a zero kilometer quote', async () => {
  for (const [result, status] of [[null, 'ZERO_RESULTS'], [{ routes: [{ legs: [{}] }] }, 'OK'], [{ routes: [{ legs: [] }] }, 'OK']]) {
    globalThis.window = { google: { maps: { DirectionsService: class { route(input, callback) { callback(result, status); } } } } };
    await assert.rejects(calculateRouteDistance(['Base', 'Puerto']));
  }
  delete globalThis.window;
});


test('percentage additionals use transport base only, with discount before margin', () => {
 const draft=draftWithTolls(12000);
 draft.additionals=[{id:'pct',name:'Seguro',description:'Cobertura adicional',kind:'percent',amount:10,discountPercent:20,confirmedDifferentAmount:true},{id:'fixed',name:'Espera',kind:'fixed',amount:500,discountPercent:0,confirmedDifferentAmount:true}];
 assert.equal(calculateAdditionalAmount(draft.additionals[0],15000),1200);
 const quote=buildPreparedQuote(draft,[],{perDay:5000,perKm:100});
 assert.equal(quote.amount,(15000+12000+1200+500)/0.8);
 assert.match(quote.text,/10% del transporte base/);
 assert.match(quote.text,/Cobertura adicional/);
 draft.distanceKm=200;
 assert.equal(buildPreparedQuote(draft,[],{perDay:5000,perKm:100}).amount,(25000+12000+2000+500)/0.8);
});

test('legacy additionals remain fixed and invalid amounts cannot create quotes',()=>{
 assert.equal(calculateAdditionalAmount({amount:100,discountPercent:10},5000),90);
 assert.equal(calculateAdditionalAmount({amount:0,kind:'percent',discountPercent:0},5000),0);
 assert.throws(()=>calculateAdditionalAmount({amount:-1,discountPercent:0},5000));
 assert.throws(()=>calculateAdditionalAmount({amount:10,discountPercent:101},5000));
});

test('route refresh preserves individual payment and selections even with a pending price', () => {
 const incoming = [{ id: 'osm:1:0', name: 'Hudson', amount: null, source: 'pending', payment: '' }];
 const previous = [{ ...incoming[0], payment: 'cash', period: 'peak', direction: 'caba' }];
 const refreshed = mergeRouteTolls(incoming, previous);
 assert.equal(refreshed[0].payment, 'cash');
 assert.equal(refreshed[0].period, 'peak');
 assert.equal(refreshed[0].direction, 'caba');
});
