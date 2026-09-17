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
const { getQuoteStageErrors, getClientContacts, roundQuoteTariff, initialClients, BERISSO_ADDRESS, getRouteStops, createAdditionalSelection, calculateGoogleRoute, getTollGroups, calculateAdditionalAmount, calculateRouteDistance, createQuoteDraft, getTruckRouteKey, buildPreparedQuote, summarizeTolls, mergeRouteTolls } = await import(pathToFileURL(`${temp}/quote.mjs`).href);

test('wizard gates client, contact, route, margin and toll confirmation independently', () => {
 const draft={...createQuoteDraft(initialClients[0].id),transportKind:'carreton',origin:'Carga',destination:'Descarga'};
 assert.match(getQuoteStageErrors(draft,initialClients)[0],/contacto/);
 draft.contactKey='operationalContact';
 assert.equal(getQuoteStageErrors(draft,initialClients)[0],'');
 assert.equal(getQuoteStageErrors(draft,initialClients)[1],'');
 draft.requestDate='2026-02-31';
 assert.match(getQuoteStageErrors(draft,initialClients)[0],/fechas/);
 draft.requestDate='2026-09-17';
 draft.distanceKm=100; draft.utilityPercent=0;
 assert.equal(getQuoteStageErrors(draft,initialClients)[2],'');
 assert.match(getQuoteStageErrors(draft,initialClients)[3],/peajes/);
 draft.tollRouteKey=getTruckRouteKey(draft);draft.tollListStatus='manual';
 assert.ok(getQuoteStageErrors(draft,initialClients).every(error=>!error));
 draft.destination='';
 assert.match(getQuoteStageErrors(draft,initialClients)[1],/direcciones/);
 assert.match(getQuoteStageErrors(draft,initialClients)[3],/peajes/);
 assert.equal(getClientContacts(initialClients[0]).length,3);
 assert.equal(getClientContacts({...initialClients[0],commercialContact:{fullName:''}}).length,2);
});

test('new transport types leave their selected base and include intermediate stops before returning to it', () => {
 for(const transportKind of ['carreton','distribucion','carga-suelta']) {
   const draft={...createQuoteDraft('demo'),transportKind,base:'Base Berisso',origin:'Carga',destination:'Descarga',isRoundTrip:true,
     intermediateStops:[{id:'1',address:'Intermedio',afterStop:1,transportKind}]};
   assert.deepEqual(getRouteStops(draft),[BERISSO_ADDRESS,'Carga','Intermedio','Descarga',BERISSO_ADDRESS]);
   assert.deepEqual(getRouteStops({...draft,isRoundTrip:false}),[BERISSO_ADDRESS,'Carga','Intermedio','Descarga']);
 }
});

test('rounding applies after the existing margin formula and the saved quote snapshots its contact and inputs', () => {
 assert.equal(roundQuoteTariff(1234.56,100),1300);
 assert.equal(roundQuoteTariff(1200,100),1200);
 assert.equal(roundQuoteTariff(1234.56,0),1234.56);
 assert.equal(roundQuoteTariff(1234.56,1),1235);
 assert.throws(()=>roundQuoteTariff(1234,7));
 const draft={...draftWithTolls(100),clientId:initialClients[0].id,contactKey:'commercialContact',roundingUnit:1000};
 const quote=buildPreparedQuote(draft,initialClients,{perDay:5000,perKm:100});
 assert.equal(quote.amount,Math.ceil(((15000+100)/.8)/1000)*1000);
 assert.equal(quote.contact.fullName,initialClients[0].commercialContact.fullName);
 assert.match(quote.text,/Fórmula:/);assert.match(quote.text,/Redondeo:/);
 draft.tolls[0].amount=900;
 assert.equal(quote.draft.tolls[0].amount,100);
});

test('intermediate stops preserve segment order, include optional return stops once, and isolate transport types', () => {
 const draft={...createQuoteDraft('demo'),transportKind:'otro',origin:'CABA',destination:'Zárate',isRoundTrip:true,intermediateStops:[
   {id:'1',address:'Escobar',afterStop:0,transportKind:'otro'},
   {id:'2',address:'Campana',afterStop:0,transportKind:'otro'},
   {id:'3',address:'Pilar',afterStop:1,transportKind:'otro'},
   {id:'4',address:'Otro viaje',afterStop:1,transportKind:'expo'}
 ]};
 assert.deepEqual(getRouteStops(draft),['CABA','Escobar','Campana','Zárate','Pilar','CABA']);
 assert.deepEqual(getRouteStops({...draft,isRoundTrip:false}),['CABA','Escobar','Campana','Zárate']);
 const moved={...draft,intermediateStops:[draft.intermediateStops[1],draft.intermediateStops[0],...draft.intermediateStops.slice(2)]};
 assert.deepEqual(getRouteStops(moved),['CABA','Campana','Escobar','Zárate','Pilar','CABA']);
 assert.notEqual(getTruckRouteKey(moved),getTruckRouteKey(draft));
 assert.deepEqual(getRouteStops({...draft,intermediateStops:draft.intermediateStops.filter(stop=>stop.id!=='1')}),['CABA','Campana','Zárate','Pilar','CABA']);
});

test('Expo and Impo insert intermediate stops between their operational stops and retain blank stops for validation', () => {
 for(const transportKind of ['expo','impo']) {
   const draft={...createQuoteDraft('demo'),transportKind,base:'Base Lavaisse',emptyPickup:'Puerto',fullPickupPort:'Puerto',consolidationDestination:'Cliente',deconsolidationDestination:'Cliente',deliveryPort:'Terminal',emptyReturnYard:'Terminal',isRoundTrip:true,
     intermediateStops:[{id:'x',address:'Balanza',afterStop:1,transportKind},{id:'y',address:'',afterStop:2,transportKind}]};
   assert.deepEqual(getRouteStops(draft).slice(1,-1),['Puerto','Balanza','Cliente','','Terminal']);
   const key=getTruckRouteKey(draft);
   assert.notEqual(key,getTruckRouteKey({...draft,intermediateStops:[]}));
 }
});

test('Google receives every intermediate stop in sequence and does not mirror outbound stops on return', async () => {
 const draft={...createQuoteDraft('demo'),transportKind:'otro',origin:'CABA',destination:'Zárate',isRoundTrip:true,
   intermediateStops:[{id:'x',address:'Escobar',afterStop:0,transportKind:'otro'}]};
 const requests=[];
 globalThis.window={google:{maps:{DirectionsService:class{route(request,callback){requests.push([request.origin,request.destination]);callback({routes:[{legs:[{distance:{value:10000},steps:[{path:[{lat:()=>-34,lng:()=>-58},{lat:()=>-34.1,lng:()=>-58}]}]}]}]},'OK');}}}}};
 try {
   const result=await calculateGoogleRoute(getRouteStops(draft));
   assert.equal(result.distanceKm,30);
   assert.deepEqual(requests,[['CABA','Escobar'],['Escobar','Zárate'],['Zárate','CABA']]);
   assert.deepEqual(result.legs.map(leg=>[leg.origin,leg.destination]),requests);
 } finally {delete globalThis.window;}
});

test('selected additionals use the ABM base amount, preserve percentage meaning and allow quote-only edits', () => {
 const definition={id:'wait',name:'Espera',description:'',kind:'fixed',amount:2500};
 const selected=createAdditionalSelection(definition,1000);
 assert.equal(selected.amount,2500);
 const draft=draftWithTolls(0);
 draft.additionals=[];
 const without=buildPreparedQuote(draft,[],{perDay:5000,perKm:100}).amount;
 draft.additionals=[selected];
 assert.equal(buildPreparedQuote(draft,[],{perDay:5000,perKm:100}).amount,without);
 selected.amount=3000;
 assert.equal(definition.amount,2500);
 assert.equal(buildPreparedQuote(draft,[],{perDay:5000,perKm:100}).amount,without);
 const percentage=createAdditionalSelection({...definition,kind:'percent',amount:10});
 assert.equal(calculateAdditionalAmount(percentage,15000),1500);
 draft.additionals=[];
 assert.equal(buildPreparedQuote(draft,[],{perDay:5000,perKm:100}).amount,without);
});

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
  assert.equal(quote.amount, (5000 + 100 * 100 + 12000) / 0.8);
  assert.match(quote.text, /Total peajes:/);
});
test('unknown or outdated tolls cannot produce a quote', () => {
  assert.throws(() => buildPreparedQuote(draftWithTolls(null), [], { perDay: 5000, perKm: 100 }));
  const changed = draftWithTolls(12000); changed.isRoundTrip = !changed.isRoundTrip;
  assert.throws(() => buildPreparedQuote(changed, [], { perDay: 5000, perKm: 100 }));
});
test('confirmed zero is valid and payment or dimensions do not change the Google route', () => {
  assert.equal(buildPreparedQuote(draftWithTolls(0), [], { perDay: 5000, perKm: 100 }).amount, 18750);
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


test('conditional additionals retain discounted amounts and conditions without affecting the tariff', () => {
 const draft=draftWithTolls(12000);
 draft.additionals=[{id:'pct',name:'Seguro',description:'Cobertura adicional',kind:'percent',amount:10,discountPercent:20,confirmedDifferentAmount:true},{id:'fixed',name:'Espera',kind:'fixed',amount:500,discountPercent:0,confirmedDifferentAmount:true}];
 assert.equal(calculateAdditionalAmount(draft.additionals[0],15000),1200);
 const quote=buildPreparedQuote(draft,[],{perDay:5000,perKm:100});
 assert.equal(quote.amount,(15000+12000)/0.8);
 assert.match(quote.text,/10% del transporte base/);
 assert.match(quote.text,/Cobertura adicional/);
 assert.match(quote.text,/no incluidos en el total; se cobran solo si se producen/);
 assert.deepEqual(quote.draft.additionals,draft.additionals);
 draft.distanceKm=200;
 assert.equal(buildPreparedQuote(draft,[],{perDay:5000,perKm:100}).amount,(25000+12000)/0.8);
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
  assert.deepEqual(route.legs.map(leg=>[leg.origin,leg.destination,leg.path.length]),[['Base','Retiro',3],['Retiro','Destino',2],['Destino','Base',2]]);
 } finally { delete globalThis.window; }
});

test('refreshed leg attribution and physical sense cannot be overwritten by stale labels', () => {
 const current={id:'outbound:leg-0:osm:1:0',name:'Campana',journey:'outbound',travelSense:'Hacia Escobar / Zárate',legOrigin:'TRP',legDestination:'Zárate',legIndex:0};
 const [merged]=mergeRouteTolls([current],[{...current,journey:'return',travelSense:'Hacia CABA',legOrigin:'Zárate',legDestination:'TRP',amount:100,source:'manual'}]);
 assert.equal(merged.journey,'outbound');
 assert.equal(merged.travelSense,'Hacia Escobar / Zárate');
 assert.equal(merged.legOrigin,'TRP');
 assert.equal(merged.amount,100);
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
