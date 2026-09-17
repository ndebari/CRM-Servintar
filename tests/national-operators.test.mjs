import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { findPublication, searchOfficialTariffs, publicationDigest } from '../netlify/lib/official-publications.mjs';
import publications from '../netlify/lib/verified-tariffs.json' with { type: 'json' };
import catalog from '../netlify/lib/toll-operators.json' with { type: 'json' };

test('homonymous stations require an operator even when only one has a tariff', () => {
  for (const name of ['Zárate', 'Junín', 'Pilar', 'Buen Ayre']) {
    const result = findPublication({ name, period: 'normal' }, 'tag');
    assert.equal(result.source, undefined, name);
    assert.equal(result.operator, undefined, name);
    assert.match(result.reason, /varias concesionarias/);
  }
  assert.equal(findPublication({name:'Zárate',operator:'aumesa'},'tag').source.rates.tag.normal,32584.19);
  assert.equal(findPublication({name:'Zárate',operator:'portuario-sur'},'tag').source,undefined);
});

test('electronic payment is distinct from cash and local discounts are not applied', () => {
  assert.equal(findPublication({name:'Olivera'},'cash').source.rates.cash.normal,14300);
  assert.equal(findPublication({name:'Olivera'},'electronic').source.rates.electronic.normal,14296.78);
  assert.equal(findPublication({name:'Colonia Elía'},'cash').source,undefined);
  assert.equal(findPublication({name:'Bouwer'},'tag').source,undefined);
  assert.equal(findPublication({name:'Bouwer'},'cash').source.rates.cash.normal,24000);
});

test('unverified operators keep an empty amount and a usable official source', async () => {
  const [row] = await searchOfficialTariffs([{id:'1',name:'Los Puquios',operator:'sanluis'}],'tag',()=>{throw Error('Must not fetch unknown rates');});
  assert.equal(row.amount,null);
  assert.equal(row.source,'pending');
  assert.ok(row.sourcePage.startsWith('https://'));
  assert.equal(new Set(catalog.operators.map(o=>o.id)).size,catalog.operators.length);
  for(const p of publications) assert.ok(catalog.operators.some(o=>o.id===p.operator));
});

test('new linked publications require both the active link and exact bytes', async () => {
  const p = publications.find(p=>p.operator==='pentavia');
  const original=p.sha256;
  const bytes=Buffer.from('six axle table fixture');
  p.sha256=createHash('sha256').update(bytes).digest('hex');
  const toll={id:'1',name:'Olivera',payment:'electronic'};
  try {
    const good=url=>Promise.resolve(new Response(url===p.page?p.document:bytes));
    assert.equal((await searchOfficialTariffs([toll],'tag',good))[0].amount,14296.78);
    const removed=()=>Promise.resolve(new Response('new table'));
    assert.equal((await searchOfficialTariffs([toll],'tag',removed))[0].amount,null);
  } finally {p.sha256=original;}
});

test('Corresur hashes categories, station scope and payment tables, not rotating footer content', () => {
  const source={verification:'corresur-section'};
  const section='<h2>Cuadro tarifario</h2><h3>Riccheri</h3><table class="tabla-tarifa-a">6195.30</table><table class="tabla-tarifa-b">7148.39</table></section>';
  const digest=html=>publicationDigest(Buffer.from(html),source);
  assert.equal(digest(section+'footer 1'),digest(section+'footer 2'));
  assert.notEqual(digest(section),digest(section.replace('7148.39','9999')));
  assert.notEqual(digest(section),digest(section.replace('Riccheri','Otra estación')));
  assert.throws(()=>digest('<h2>Nuevo diseño</h2>'));
});
