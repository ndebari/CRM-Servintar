import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateCrossings, estimateJourneyCrossings } from '../netlify/lib/route-stations.mjs';
import { handler } from '../netlify/functions/route-tolls.mjs';
const stations = [
 {id:1,lat:-34,lon:-58,name:'Peaje prueba',locality:'Localidad'},
 {id:2,lat:-34.0001,lon:-58,name:'Peaje prueba',locality:'Localidad'},
 {id:3,lat:-34.01,lon:-58.001,name:'Fuera del recorrido'},
];
test('projects onto route segments, groups lanes and retains return crossing',()=>{
 const rows=estimateCrossings([[-34.02,-58],[-33.98,-58],[-34.02,-58]],stations);
 assert.equal(rows.length,2);assert.notEqual(rows[0].id,rows[1].id);
 assert.equal(rows[0].name,'Peaje prueba');assert.equal(rows[0].amount,null);
});
test('never inserts stations outside path or equates no match with verified toll-free route',async()=>{
 assert.equal(estimateCrossings([[-33,-60],[-32,-60]],stations).length,0);
 const response=await handler({httpMethod:'POST',body:JSON.stringify({path:[[-33,-60],[-32,-60]]})});
 assert.equal(JSON.parse(response.body).estimated,true);
 assert.equal((await handler({httpMethod:'POST',body:'{"path":[[0,0],[0,1]]}'})).statusCode,400);
});

test('groups by actual outbound/return geometry, preserving the same station in both', () => {
 const path = [[-34.02,-58],[-33.98,-58],[-33.98,-58],[-34.02,-58]];
 const rows = estimateJourneyCrossings(path, 2, stations);
 assert.equal(rows.length, 2);
 assert.deepEqual(rows.map(row => row.journey), ['outbound', 'return']);
 assert.notEqual(rows[0].id, rows[1].id);
 assert.equal(rows[0].name, rows[1].name);
 const oneWay = estimateJourneyCrossings(path, undefined, stations);
 assert.ok(oneWay.every(row => row.journey === 'outbound'));
});
test('return segmentation never creates a connector across unrelated path groups', () => {
 const rows = estimateJourneyCrossings([[-34.02,-58],[-34.01,-58],[-33.99,-58],[-33.98,-58]], 2, stations);
 assert.equal(rows.length, 0);
});
test('rejects invalid return boundaries', async () => {
 for (const returnStartIndex of [-1, 0, 1, 3, 4, 2.5, '2']) {
  const result = await handler({ httpMethod: 'POST', body: JSON.stringify({path:[[-34.02,-58],[-33.98,-58],[-33.98,-58],[-34.02,-58]], returnStartIndex}) });
  assert.equal(result.statusCode, 400);
 }
});
