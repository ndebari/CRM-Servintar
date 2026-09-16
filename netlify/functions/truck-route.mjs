const reply = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
const positive = (value, max) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max;

export function buildRequest(input) {
  const { stops, truck, payment } = input ?? {};
  if (!Array.isArray(stops) || stops.length < 2 || stops.length > 10 || stops.some(s => typeof s !== 'string' || !s.trim() || s.length > 300)) throw new Error('Completá todos los puntos del recorrido.');
  if (!truck || truck.tractorAxles !== 3 || !positive(truck.height, 6) || !positive(truck.weight, 100) || !positive(truck.length, 30)) throw new Error('Completá los ejes del tractor, altura, peso bruto y largo del conjunto.');
  if (!['tag', 'cash'].includes(payment)) throw new Error('Seleccioná la forma de pago de peajes.');
  const axles = truck.tractorAxles + 3;
  return {
    from: { address: stops[0] }, to: { address: stops.at(-1) },
    waypoints: stops.slice(1, -1).map(address => ({ address })),
    serviceProvider: 'here', units: { currency: 'ARS' },
    vehicle: { type: `${axles}AxlesTruck`, axles, height: { value: truck.height, unit: 'meter' }, weight: { value: truck.weight, unit: 'tonnes' }, length: { value: truck.length, unit: 'meter' } },
    truck: { truckType: 'tractorTruck', trailersCount: 1, truckRestrictionPenalty: 'strict', height: truck.height / 0.3048, length: truck.length / 0.3048, limitedWeight: truck.weight * 2204.62262185 }
  };
}

export function parseRoute(data, payment, vehicleType) {
  if (data.status !== 'OK' || data.summary?.vehicleType !== vehicleType) throw new Error('El proveedor no confirmó una ruta para este camión.');
  const routes = data.routes?.filter(route => positive(route.summary?.distance?.value, 20000000) && positive(route.summary?.duration?.value, 10000000));
  if (!routes?.length) throw new Error('No se encontró un recorrido apto para este camión.');
  const route = [...routes].sort((a, b) => a.summary.duration.value - b.summary.duration.value)[0];
  if (route.summary.note?.length) throw new Error('La ruta tiene advertencias del proveedor y requiere revisión manual.');
  const currency = data.summary?.currency ?? data.summary?.fuelPrice?.currency;
  if (currency && currency !== 'ARS') throw new Error('El proveedor devolvió una moneda diferente de ARS.');
  if (route.summary.hasTolls !== false && (!Array.isArray(route.tolls) || !route.tolls.length)) throw new Error('El proveedor no devolvió el detalle de estaciones.');
  const entries = route.summary.hasTolls === false ? [] : route.tolls.flat();
  const tolls = entries.map((toll, index) => {
    // Route provider identifies crossings only. Prices are sourced from official publications.
    const amount = null;
    return {
      id: String(toll.id ?? toll.name ?? 'peaje') + ':' + index,
      name: typeof toll.name === 'string' ? toll.name : '',
      locality: typeof toll.city === 'string' ? toll.city : typeof toll.locality === 'string' ? toll.locality : '',
      road: typeof toll.road === 'string' ? toll.road : '',
      province: typeof toll.state === 'string' ? toll.state : '',
      amount, source: amount === null ? 'pending' : 'automatic'
    };
  });
  return { distanceKm: Math.ceil(route.summary.distance.value / 1000), tolls, currency: 'ARS', provider: 'TollGuru / HERE', calculatedAt: new Date().toISOString() };
}

export async function handler(event) {
  if (event.httpMethod === 'GET') return reply(200, { available: Boolean(process.env.TOLLGURU_API_KEY) });
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Método no permitido.' });
  if ((event.body?.length ?? 0) > 8000) return reply(413, { error: 'Solicitud demasiado grande.' });
  let input, request;
  try { input = JSON.parse(event.body ?? '{}'); request = buildRequest(input); }
  catch (error) { return reply(400, { error: error instanceof SyntaxError ? 'Solicitud inválida.' : error.message }); }
  if (!process.env.TOLLGURU_API_KEY) return reply(503, { error: 'Detección de estaciones y ruta de camión pendiente de activar. Los kilómetros de Google son estimados; cargá el listado de peajes manualmente.' });
  try {
    const response = await fetch('https://apis.tollguru.com/toll/v2/origin-destination-waypoints', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.TOLLGURU_API_KEY },
      body: JSON.stringify(request), signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) return reply(502, { error: 'No se pudo consultar la tarifa de camión. Cargá el importe manualmente o reintentá.' });
    return reply(200, parseRoute(await response.json(), input.payment, request.vehicle.type));
  } catch { return reply(502, { error: 'No se pudo verificar el recorrido y los peajes para este camión. Revisá los datos o cargalos manualmente.' }); }
}
