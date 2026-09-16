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
const { createQuoteDraft, getTruckRouteKey, buildPreparedQuote, summarizeTolls, mergeRouteTolls } = await import(pathToFileURL(`${temp}/quote.mjs`).href);

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
test('confirmed zero is valid and changing vehicle/payment invalidates the quote', () => {
  assert.equal(buildPreparedQuote(draftWithTolls(0), [], { perDay: 5000, perKm: 100 }).amount, 19875);
  const changed = draftWithTolls(100); changed.truck = { ...changed.truck, tractorAxles: 2 };
  assert.throws(() => buildPreparedQuote(changed, [], { perDay: 5000, perKm: 100 }));
  const payment = draftWithTolls(100); payment.tollPayment = 'tag';
  assert.throws(() => buildPreparedQuote(payment, [], { perDay: 5000, perKm: 100 }));
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
