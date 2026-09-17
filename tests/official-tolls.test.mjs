import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { findPublication, searchOfficialTariffs, readOfficial } from '../netlify/lib/official-publications.mjs';
import publications from '../netlify/lib/verified-tariffs.json' with { type: 'json' };
const toll = { id: '1', name: 'Peaje Hudson', operator: 'aubasa', period: 'normal', direction: 'la-plata' };

test('matching requires station, direction and peak period for six-axle tariff', () => {
 assert.ok(findPublication(toll, 'tag').source);
 assert.ok(findPublication({ ...toll, direction: '' }, 'tag').reason);
 assert.ok(findPublication({ ...toll, period: '' }, 'tag').reason);
 assert.ok(findPublication({ ...toll, name: 'No existe' }, 'tag').reason);
 assert.ok(findPublication({ ...toll, name: 'No existe', operator: 'ausol' }, 'tag').reason);
 assert.equal(findPublication(toll, 'tag').source.rates.tag.normal, 11975.15);
 assert.equal(findPublication({ ...toll, direction: 'caba' }, 'cash').source.rates.cash.normal, 24000);
 assert.match(findPublication({ ...toll, name: 'Maipú', direction: '', period: '' }, 'tag').source.category, /^5/);
});
test('changed document or removed publication never returns old stored tariff', async () => {
 const source = findPublication(toll, 'tag').source;
 const changed = async url => new Response(url === source.page ? source.document : 'modified publication');
 assert.equal((await searchOfficialTariffs([toll], 'tag', changed))[0].amount, null);
 assert.equal((await searchOfficialTariffs([toll], 'tag', async () => new Response('new document')))[0].amount, null);
});
test('verified bytes fill exact official amount and deduplicate repeated crossings', async () => {
 const source = publications.find(p => p.operator === 'aubasa' && p.direction === 'la-plata' && p.stations.includes('hudson'));
 const original = source.sha256; const bytes = Buffer.from('verified fixture');
 source.sha256 = createHash('sha256').update(bytes).digest('hex');
 let calls = 0;
 try {
  const mock = async url => { calls++; return new Response(url === source.page ? source.document : bytes); };
  const results = await searchOfficialTariffs([toll, { ...toll, id: '2' }], 'tag', mock);
  assert.equal(results.length, 2); assert.equal(results[0].amount, 11975.15); assert.equal(results[1].amount, 11975.15);
  assert.equal(results[0].sourceUrl, source.document); assert.equal(calls, 2);
 } finally { source.sha256 = original; }
});
test('errors stay editable; arbitrary URLs are never fetched', async () => {
 const fail = async () => { throw new Error('unavailable'); };
 assert.equal((await searchOfficialTariffs([toll], 'tag', fail))[0].amount, null);
 await assert.rejects(() => readOfficial('http://127.0.0.1/private', fail));
});


test('recognizes concessionaire from station and preserves explicit choices', () => {
 assert.equal(findPublication({name:'  Peaje   Campana ',period:'normal'},'tag').source.operator,'ausol');
 assert.equal(findPublication({name:'Hudson'},'tag').operator,'aubasa');
 assert.match(findPublication({name:'Hudson'},'tag').reason,/sentido/);
 assert.equal(findPublication({name:'Campana',operator:'other',period:'normal'},'tag').source,undefined);
 assert.equal(findPublication({name:'Estación desconocida',period:'normal'},'tag').source,undefined);
});

test('recognizes quoted station names from the OSM route catalog without fuzzy matching', () => {
 for (const name of ['Estación de Peaje "Gutiérrez"', 'Estación de Peaje “Gutiérrez”', 'Peaje «Gutiérrez»']) {
  assert.equal(findPublication({ ...toll, name }, 'tag').source.stations.includes('gutierrez'), true);
 }
 assert.equal(findPublication({ ...toll, name: 'Gutiérrez otra estación' }, 'tag').source, undefined);
 assert.equal(findPublication({ ...toll, name: '"Gutiérrez"', operator: 'other' }, 'tag').source, undefined);
});

test('Hudson reports every missing price selection together', async () => {
 const incomplete = { id: 'hudson', name: 'Hudson', operator: 'aubasa' };
 const pending = findPublication(incomplete, '');
 assert.match(pending.reason, /forma de pago/);
 assert.match(pending.reason, /sentido/);
 assert.match(pending.reason, /horario/);
 const afterPayment = findPublication(incomplete, 'tag');
 assert.doesNotMatch(afterPayment.reason, /forma de pago/);
 assert.match(afterPayment.reason, /sentido/);
 assert.match(afterPayment.reason, /horario/);
 assert.ok(findPublication({ ...incomplete, direction: 'la-plata', period: 'normal' }, 'tag').source);
 let downloads = 0;
 const result = await searchOfficialTariffs([incomplete], '', async () => { downloads++; throw new Error('Should not download before selections'); });
 assert.equal(downloads, 0);
 assert.equal(result[0].amount, null);
 assert.match(result[0].lookupMessage, /automáticamente/);
});
