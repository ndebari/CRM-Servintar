import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, parseRoute, handler } from '../netlify/functions/truck-route.mjs';
const input = { stops: ['Buenos Aires', 'Rosario', 'Buenos Aires'], truck: { tractorAxles: 3, height: 4.3, weight: 45, length: 18 }, payment: 'tag' };
const station = (amount = 100) => ({ id: 12, name: 'Estación prueba', city: 'Localidad prueba', state: 'Buenos Aires', road: 'Ruta prueba', tagCost: amount, cashCost: 200, currency: 'ARS' });
const result = () => ({ status: 'OK', summary: { vehicleType: '6AxlesTruck', currency: 'ARS' }, routes: [{ summary: { hasTolls: true, distance: { value: 620500 }, duration: { value: 30000 }, note: [] }, tolls: [station(), station(null)] }] });
test('six axles and strict tractor routing include return and dimensions', () => {
 const req = buildRequest(input);
 assert.equal(req.vehicle.type, '6AxlesTruck'); assert.equal(req.vehicle.axles, 6);
 assert.equal(req.truck.truckType, 'tractorTruck'); assert.equal(req.truck.trailersCount, 1);
 assert.equal(req.truck.truckRestrictionPenalty, 'strict'); assert.equal(req.serviceProvider, 'here');
 assert.deepEqual(req.from, req.to); assert.equal(req.waypoints.length, 1);
 assert.throws(() => buildRequest({ ...input, truck: { ...input.truck, tractorAxles: 2 } }));
 assert.throws(() => buildRequest({ ...input, stops: ['Buenos Aires', ''] }));
});
test('every crossing has a unique row even on return through same toll', () => {
 const route = parseRoute(result(), 'tag', '6AxlesTruck');
 assert.equal(route.tolls.length, 2); assert.notEqual(route.tolls[0].id, route.tolls[1].id);
 assert.equal(route.tolls[0].name, 'Estación prueba'); assert.equal(route.tolls[0].locality, 'Localidad prueba');
 assert.equal(route.tolls[0].amount, null); assert.equal(route.tolls[1].amount, null);
 assert.equal(parseRoute(result(), 'cash', '6AxlesTruck').tolls[1].amount, null);
});
test('missing prices, other per-station currency, and missing locality remain editable', () => {
 for (const amount of [false, null, -1, '100']) {
  const data = result(); data.routes[0].tolls = [station(amount)];
  assert.equal(parseRoute(data, 'tag', '6AxlesTruck').tolls[0].amount, null);
 }
 const data = result(); delete data.routes[0].tolls[0].city; data.routes[0].tolls[0].currency = 'USD';
 const toll = parseRoute(data, 'tag', '6AxlesTruck').tolls[0];
 assert.equal(toll.amount, null); assert.equal(toll.locality, '');
});
test('no stations is accepted only when provider explicitly confirms no tolls', () => {
 const data = result(); data.routes[0].tolls = [];
 assert.throws(() => parseRoute(data, 'tag', '6AxlesTruck'));
 data.routes[0].summary.hasTolls = false;
 assert.deepEqual(parseRoute(data, 'tag', '6AxlesTruck').tolls, []);
});
test('car category and restricted routes are rejected', () => {
 const data = result(); data.summary.vehicleType = '2AxlesAuto'; assert.throws(() => parseRoute(data, 'tag', '6AxlesTruck'));
 data.summary.vehicleType = '6AxlesTruck'; data.routes[0].summary.note = ['restriction']; assert.throws(() => parseRoute(data, 'tag', '6AxlesTruck'));
});
test('unconfigured provider returns actionable error', async () => {
 const previous = process.env.TOLLGURU_API_KEY; delete process.env.TOLLGURU_API_KEY;
 try { assert.equal((await handler({ httpMethod: 'POST', body: JSON.stringify(input) })).statusCode, 503); }
 finally { if (previous !== undefined) process.env.TOLLGURU_API_KEY = previous; }
});
