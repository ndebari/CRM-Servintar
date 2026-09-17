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
const catalogUrl = new URL('../netlify/lib/toll-operators.json', import.meta.url).href;
await writeFile(`${temp}/quote.mjs`, compiled.outputText.replace("'../netlify/lib/toll-operators.json'", JSON.stringify(catalogUrl) + " with { type: 'json' }"));
const { calculateGoogleRoute, getTollGroups, calculateAdditionalAmount, calculateRouteDistance, createQuoteDraft, getTruckRouteKey, buildPreparedQuote, summarizeTolls, mergeRouteTolls } = await import(pathToFileURL(`${temp}/quote.mjs`).href);

function draftWithTolls(amount) {
  const draft = { ...createQuoteDraft('demo'), distanceKm: 100, requiredDays: 1, utilityPercent: 20, tolls: [{ id: 'a:0', name: 'Peaje prueba', locality: 'Localidad prueba', road: '', province: '', amount, source: 'manual' }], tollListStatus: 'manual', additionals: [{ id: '1', name: 'Demora', amount: 1000, discountPercent: 10 }] };
  draft.tollRouteKey = getTruckRouteKey(draft);
  return draft;
}

test('Base Lavaisse and its legacy label route to the actual address, including the return', () => {
 const draft = {...createQuoteDraft('demo'),emptyPickup:'TRP',consolidationDestination:'Cliente',deliveryPort:'Terminal Zárate',isRoundTrip:true};
 assert.equal(draft.base,'Base Lavaisse');
 const stops=JSON.parse(getTruckRouteKey(draft)).stops;
 assert.equal(stops[0],'Benjamín Lavaisse 1401, Ciudad Autónoma de Buenos Aires, Argentina');
 assert.equal(stops.at(-1),stops[0]);
 assert.equal(getTruckRouteKey({...draft,base:'Base Buenos Aires'}),getTruckRouteKey(draft));
 assert.deepEqual(JSON.parse(getTruckRouteKey({...draft,transportKind:'otro',origin:'Base Lavaisse',destination:'Terminal Zárate',isRoundTrip:false})).stops,[stops[0],'Terminal Zárate']);
});
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
  const requests = [];
  const distances = [12000, 23000, 34000];
  globalThis.window = { google: { maps: { DirectionsService: class { route(input, callback) {
    requests.push(input);
    callback({ routes: [{ legs: [{ distance: { value: distances[requests.length - 1] } }] }] }, 'OK');
  } } } } };
  assert.equal(await calculateRouteDistance(['Base', 'Retiro', 'Puerto', 'Base']), 69);
  assert.deepEqual(requests.map(r => [r.origin, r.destination]), [['Base','Retiro'],['Retiro','Puerto'],['Puerto','Base']]);
  assert.ok(requests.every(r => r.provideRouteAlternatives && r.avoidHighways === false && r.avoidTolls === false && r.travelMode === 'DRIVING' && !r.waypoints));
  delete globalThis.window;
});

test('Google errors and incomplete distances never become a zero kilometer quote', async () => {
  for (const [result, status] of [[null, 'ZERO_RESULTS'], [{ routes: [{ legs: [{}] }] }, 'OK'], [{ routes: [{ legs: [] }] }, 'OK']]) {
    globalThis.window = { google: { maps: { DirectionsService: class { route(input, callback) { callback(result, status); } } } } };
    await assert.rejects(calculateRouteDistance(['Base', 'Puerto']));
  }
  delete globalThis.window;
});

test('major-road preference selects matching geometry and distance, bounds detours, and favors avenues over streets', async () => {
  const route = (distance, road, marker) => ({ legs: [{ distance: { value: distance }, steps: [{
    instructions: `Continuá por <b>${road}</b>`, distance: { value: distance },
    path: [{lat:()=>marker,lng:()=>-58},{lat:()=>marker+.01,lng:()=>-58}]
  }] }] });
  const street = route(10000, 'Calle Belgrano', -34);
  const avenue = route(10500, 'Av. del Libertador', -35);
  const motorway = route(11000, 'Autopista del Sol / RN9', -36);
  const detour = route(14000, 'RN 9', -37);
  for (const [routes, km, lat] of [
    [[street, motorway, avenue], 11, -36],
    [[street, detour, avenue], 11, -35],
    [[route(10000,'Calle Belgrano</b><div>hacia <b>RN 9',-34), avenue],11,-35],
    [[route(10000,'Calle A',-34),route(11000,'Calle B',-35)],10,-34]
  ]) {
    globalThis.window = {google:{maps:{DirectionsService:class {route(input,callback){callback({routes},'OK');}}}}};
    try {
      const selected = await calculateGoogleRoute(['Origen','Destino']);
      assert.equal(selected.distanceKm, km);
      assert.equal(selected.path[0][0],lat);
    } finally { delete globalThis.window; }
  }
});

test('bold turn directions do not hide a following motorway name and toward signs do not classify local streets', async () => {
  const leg = (instructions, lat, distance) => ({distance:{value:distance},steps:[{instructions,distance:{value:distance},path:[{lat:()=>lat,lng:()=>-58},{lat:()=>lat+.01,lng:()=>-58}]}]});
  const local = leg('Gira a la <b>derecha</b> por <b>Calle A</b> hacia <b>RN 9</b>',-35,10000);
  const highway = leg('Mantente a la <b>derecha</b> para continuar por <b>RN 9</b>',-34,10500);
  globalThis.window={google:{maps:{DirectionsService:class{route(input,callback){callback({routes:[{summary:'Calle A',legs:[local]},{summary:'RN 9',legs:[highway]}]},'OK');}}}}};
  try {
    const result=await calculateGoogleRoute(['A','B']);
    assert.equal(result.path[0][0],-34);
    assert.deepEqual(result.summaries,['RN 9']);
  } finally { delete globalThis.window; }
});

test('missing geometry in any leg prevents toll detection across invented connectors', async () => {
  let index = 0;
  globalThis.window = {google:{maps:{DirectionsService:class {route(input,callback){
    callback({routes:[{legs:[{distance:{value:1000},steps:index++ === 1 ? [] : [{path:[{lat:()=>-34,lng:()=>-58},{lat:()=>-34.01,lng:()=>-58}]}]}]}]},'OK');
  }}}}};
  try {
    const result = await calculateGoogleRoute(['Base','A','B','Base']);
    assert.equal(result.distanceKm,3);
    assert.deepEqual(result.path,[]);
  } finally { delete globalThis.window; }
});

test('confirmed tolls from the previous routing policy require recalculation', () => {
  const draft = draftWithTolls(100);
  draft.tollRouteKey = JSON.stringify(JSON.parse(draft.tollRouteKey).stops);
  assert.equal(summarizeTolls(draft).ready, false);
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

test('Google return boundary follows the final leg, not half the route', async () => {
 const point = (lat, lng) => ({lat:()=>lat, lng:()=>lng});
 const legs = [
  {distance:{value:10000},steps:[{path:[point(-34,-58),point(-34.1,-58),point(-34.2,-58)]}]},
  {distance:{value:5000},steps:[{path:[point(-34.2,-58),point(-34.3,-58)]}]},
  {distance:{value:15000},steps:[{path:[point(-34.3,-58),point(-34,-58)]}]}
 ];
 let nextLeg = 0;
 globalThis.window = {google:{maps:{DirectionsService:class {route(input, callback){callback({routes:[{legs:[legs[nextLeg++]]}]},'OK');}}}}};
 try {
  const route = await calculateGoogleRoute(['Base','Retiro','Destino','Base']);
  assert.equal(route.distanceKm, 30);
  assert.equal(route.returnStartIndex, 5);
  assert.equal(route.path.length, 7);
 } finally { delete globalThis.window; }
});
test('UI groups every crossing once and keeps unknown legacy roundtrip rows separate', () => {
 const groups = getTollGroups({isRoundTrip:true,tolls:[
  {id:'ida',journey:'outbound',amount:10}, {id:'vuelta',journey:'return',amount:20}, {id:'legacy',amount:null}
 ]});
 assert.deepEqual(groups.map(g=>g.rows.map(r=>r.index)), [[0],[1],[2]]);
 assert.equal(getTollGroups({isRoundTrip:false,tolls:[]}).length, 1);
 assert.equal(getTollGroups({isRoundTrip:true,tolls:[]}).length, 2);
});

test('utility must be explicitly numeric: zero is valid, blank and invalid values cannot produce quotes', () => {
 const draft = draftWithTolls(100);
 draft.utilityPercent = 0;
 const result = buildPreparedQuote(draft, [], {perDay:100,perKm:1});
 assert.ok(Number.isFinite(result.amount));
 assert.match(result.text, /Utilidad aplicada: 0%/);
 for (const value of ['', NaN, Infinity, -1, 100]) {
  assert.throws(() => buildPreparedQuote({...draft,utilityPercent:value}, [], {perDay:100,perKm:1}), /Completá la utilidad/);
 }
});
