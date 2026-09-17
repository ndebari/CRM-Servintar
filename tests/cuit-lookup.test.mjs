import test from 'node:test';
import assert from 'node:assert/strict';
import { validCuit, parseCompany, parseBcraCompany, handler } from '../netlify/functions/cuit-lookup.mjs';
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
 t.mock.method(globalThis,'fetch',async url=>url.includes('bcra.gob.ar') ? {ok:false,status:404} : {ok:true,text:async()=>html});
 const request={httpMethod:'POST',body:JSON.stringify({cuit})};
 assert.equal(JSON.parse((await handler(request)).body).businessName,'BANCO & COMPAÑÍA');
 globalThis.fetch.mock.mockImplementation(async url=>url.includes('bcra.gob.ar') ? {ok:false,status:404} : {ok:true,text:async()=>'<p>No results</p>'});
 assert.equal((await handler(request)).statusCode,404);
 globalThis.fetch.mock.mockImplementation(async()=>{throw new Error('offline')});
 assert.equal((await handler(request)).statusCode,502);
});

test('BCRA matches exact CUIT and returns only identity fields', async t => {
 const payload={status:200,results:{identificacion:30707637427,denominacion:'SERVINTAR SA',periodos:[{privateTestField:'omit'}]}};
 const company=parseBcraCompany(payload,'30707637427');
 assert.equal(company.businessName,'SERVINTAR SA');
 assert.equal(company.provider,'BCRA');
 assert.equal(JSON.stringify(company).includes('periodos'),false);
 assert.equal(parseBcraCompany(payload,'30500014047'),null);
 assert.equal(parseBcraCompany({status:200,results:{identificacion:30707637427,denominacion:' '}},'30707637427'),null);
 t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>payload}));
 const result=await handler({httpMethod:'POST',body:JSON.stringify({cuit:'30707637427'})});
 assert.equal(result.statusCode,200);
 assert.equal(JSON.parse(result.body).businessName,'SERVINTAR SA');
 assert.equal(globalThis.fetch.mock.callCount(),1);
});
test('unavailable source is not reported as CUIT not found', async t => {
 t.mock.method(globalThis,'fetch',async url=>url.includes('bcra.gob.ar') ? {ok:false,status:503} : {ok:true,text:async()=>'<p>No results</p>'});
 assert.equal((await handler({httpMethod:'POST',body:JSON.stringify({cuit})})).statusCode,502);
});
