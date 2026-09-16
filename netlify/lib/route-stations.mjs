import catalog from './toll-stations.json' with { type: 'json' };
import { findPublication } from './official-publications.mjs';
const meters = 111320;
export function estimateCrossings(path, stations = catalog.stations) {
  const hits = []; let traveled = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const scale = Math.cos((a[0] + b[0]) / 2 * Math.PI / 180);
    const dx = (b[1] - a[1]) * meters * scale, dy = (b[0] - a[0]) * meters;
    const length = Math.hypot(dx, dy);
    if (!length) continue;
    for (const station of stations) {
      if (station.lat < Math.min(a[0], b[0]) - .001 || station.lat > Math.max(a[0], b[0]) + .001 || station.lon < Math.min(a[1], b[1]) - .002 || station.lon > Math.max(a[1], b[1]) + .002) continue;
      const x = (station.lon - a[1]) * meters * scale, y = (station.lat - a[0]) * meters;
      const t = Math.max(0, Math.min(1, (x * dx + y * dy) / length ** 2));
      const distance = Math.hypot(x - t * dx, y - t * dy);
      if (distance <= 65) hits.push({ station, at: traveled + t * length, distance, direction: dy < 0 ? 'la-plata' : 'caba' });
    }
    traveled += length;
  }
  hits.sort((a,b) => a.at - b.at);
  const passes = [];
  for (const hit of hits) {
    const last = passes.at(-1);
    // Collapse lanes and repeated nearby path vertices, but preserve a later return crossing.
    if (last && hit.at - last.at < 400 && Math.hypot((hit.station.lat-last.station.lat)*meters,(hit.station.lon-last.station.lon)*meters*Math.cos(hit.station.lat*Math.PI/180)) < 250) {
      if ((!last.station.name && hit.station.name) || (Boolean(last.station.name) === Boolean(hit.station.name) && hit.distance < last.distance)) passes[passes.length-1] = hit;
    } else passes.push(hit);
  }
  const occurrences = new Map();
  return passes.map(hit => {
    const station = hit.station;
    const count = occurrences.get(station.id) ?? 0; occurrences.set(station.id, count + 1);
    const name = station.name || 'Peaje sin nombre (revisar)';
    const operator = findPublication({ name }, 'tag').operator;
    const coastal = operator === 'aubasa' && station.lat < -35;
    return { id: 'osm:' + station.id + ':' + count, name, locality: station.locality || '', road: station.road || '', province: '', amount: null, source: 'pending', operator,
      direction: operator === 'aubasa' ? coastal ? 'both' : hit.direction : undefined,
      lookupMessage: 'Estación estimada sobre la ruta de Google. Revisá localidad, horario y tarifa.',
      stationSourceUrl: 'https://www.openstreetmap.org/node/' + station.id };
  });
}
export const catalogDate = catalog.date;
