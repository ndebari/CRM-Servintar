import test from 'node:test';
import assert from 'node:assert/strict';
import { validCuit, parseCompany, handler } from '../netlify/functions/cuit-lookup.mjs';
const cuit = '30500014047';
const html = '<a href="detalle/' + cuit + '/banco.html"><h2 class="denominacion">BANCO &amp; COMPAÑÍA</h2></a>';
test('validates checksum before any lookup', async () => {
  assert.equal(validCuit(cuit), true);
  assert.equal(validCuit('30500014048'), false);
  assert.equal(validCuit('00000000000'), false);
  assert.equal((await handler({httpMethod:'POST',body:JSON.stringify({cuit:'30500014048'})})).statusCode,400);
});
test('accepts only exact CUIT detail name and decodes entities', () => {
  assert.equal(parseCompany(html,cuit).businessName,'BANCO & COMPAÑÍA');
  assert.equal(parseCompany(html,'20123456786'),null);
  assert.equal(parseCompany('<title>Search '+cuit+'</title>',cuit),null);
  assert.equal(parseCompany(html.replace('detalle/', 'https://other.example/detalle/'),cuit),null);
});
test('handles methods and malformed input', async () => {
 assert.equal((await handler({httpMethod:'GET'})).statusCode,405);
 assert.equal((await handler({httpMethod:'POST',body:'broken'})).statusCode,400);
});
test('lookup returns verified result and recoverable source errors', async t => {
 t.mock.method(globalThis,'fetch',async()=>({ok:true,text:async()=>html}));
 const request={httpMethod:'POST',body:JSON.stringify({cuit})};
 assert.equal(JSON.parse((await handler(request)).body).businessName,'BANCO & COMPAÑÍA');
 globalThis.fetch.mock.mockImplementation(async()=>({ok:true,text:async()=>'<p>No results</p>'}));
 assert.equal((await handler(request)).statusCode,404);
 globalThis.fetch.mock.mockImplementation(async()=>{throw new Error('offline')});
 assert.equal((await handler(request)).statusCode,502);
});
