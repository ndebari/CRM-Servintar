import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateCrossings, estimateJourneyCrossings } from '../netlify/lib/route-stations.mjs';
import { handler } from '../netlify/functions/route-tolls.mjs';
import referenceRoute from './fixtures/illia-zarate.json' with { type: 'json' };
import stationDetails from '../netlify/lib/toll-station-details.json' with { type: 'json' };
import catalog from '../netlify/lib/toll-stations.json' with { type: 'json' };
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

test('reference route to Terminal Zárate has named plazas once per direction, not parallel ramps', async () => {
 const result = await handler({httpMethod:'POST',body:JSON.stringify(referenceRoute)});
 const rows = JSON.parse(result.body).tolls;
 assert.deepEqual(rows.map(t => [t.journey,t.name,t.operator]), [
  ['outbound','Retiro II','ausa'], ['outbound','Campana','ausol'],
  ['return','Campana','ausol'], ['return','Illia','ausa']
 ]);
 assert.ok(rows.every(t => t.road && t.province));
 assert.equal(new Set(rows.map(t=>t.id)).size,4);
});

test('access lane must be followed: passing 15m away or across it is not a toll crossing', () => {
 const access = {id:101,name:'Peaje lateral',lat:-34,lon:-58,
   accessPath:[[-34,-58],[-33.999,-58]],accessToleranceMeters:8};
 const parallel = [[-34.001,-58.00016],[-33.998,-58.00016]];
 assert.equal(estimateCrossings(parallel,[access]).length,0);
 assert.equal(estimateCrossings([[-34,-58.001],[-34,-57.999]],[access]).length,0);
 assert.equal(estimateCrossings([[-34.001,-58],[-33.998,-58]],[access]).length,1);
 assert.equal(estimateCrossings([[-33.998,-58],[-34.001,-58]],[access]).length,0);
 // A later visit to the access cannot make the earlier mainline passage valid.
 const later = [...parallel,[-33.998,-57.99],[-34.001,-57.99],[-34.001,-58],[-33.998,-58]];
 assert.equal(estimateCrossings(later,[access]).length,1);
});

test('real Salguero, Sarmiento and Campana access geometry remains detectable when traversed', () => {
 for (const id of [288973972,5265026326,4598707920]) {
   const detail=stationDetails.stations.find(s=>s.id===id);
   const station={...catalog.stations.find(s=>s.id===id),...detail};
   const rows=estimateCrossings(detail.accessPath,[station]);
   assert.equal(rows.length,1,String(id));
   assert.equal(rows[0].name,detail.name);
 }
});

test('different named plazas never collapse and an immediate opposite crossing is retained', () => {
 const points=[{id:1,plazaId:'a',name:'A',lat:-34,lon:-58},{id:2,plazaId:'b',name:'B',lat:-33.999,lon:-58}];
 assert.equal(estimateCrossings([[-34.001,-58],[-33.998,-58]],points).length,2);
 assert.equal(estimateCrossings([[-34.001,-58],[-33.999,-58],[-34.001,-58]],[points[0]]).length,2);
 assert.equal(estimateCrossings([[-34.001,-58],[-33.998,-58]],[{...points[0],name:'Peaje (próximamente)'}]).length,0);
});
