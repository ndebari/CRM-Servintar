import catalog from './toll-stations.json' with { type: 'json' };
import details from './toll-station-details.json' with { type: 'json' };
import { findPublication } from './official-publications.mjs';
const meters = 111320;
const metadata = new Map(details.stations.map(station => [station.id, station]));
const namedStations = catalog.stations.map(station => ({ ...station, ...metadata.get(station.id) }));

function crossingSense(hit) {
  // Sense follows the actual crossing, independently of the journey label.
  const northbound = hit.dy > 0;
  if (hit.station.plazaId === 'ausol-campana') return northbound ? 'Hacia Escobar / Zárate' : 'Hacia CABA';
  if (hit.station.plazaId?.startsWith('ausa-')) return northbound ? 'Hacia General Paz / Acceso Norte' : 'Hacia el centro de CABA';
  const compass = ['norte', 'noreste', 'este', 'sudeste', 'sur', 'sudoeste', 'oeste', 'noroeste'];
  const bearing = (Math.atan2(hit.dx, hit.dy) * 180 / Math.PI + 360) % 360;
  return 'Hacia el ' + compass[Math.round(bearing / 45) % 8] + ' (estimado)';
}
function project(point, a, b) {
  const scale = Math.cos((a[0] + b[0]) / 2 * Math.PI / 180);
  const dx = (b[1] - a[1]) * meters * scale, dy = (b[0] - a[0]) * meters;
  const length = Math.hypot(dx, dy);
  if (!length) return { distance: Infinity, t: 0, length, dx, dy };
  const x = (point[1] - a[1]) * meters * scale, y = (point[0] - a[0]) * meters;
  const t = Math.max(0, Math.min(1, (x * dx + y * dy) / length ** 2));
  return { distance: Math.hypot(x - t * dx, y - t * dy), t, length, dx, dy };
}

// A nearby motorway must not trigger a toll on its parallel entrance ramp.
// Require the route to continue along the mapped access at 20 m and 40 m
// after the booth, in travel order. Keep this local to the candidate crossing
// so a later visit to the ramp cannot validate an earlier mainline passage.
function followsAccess(hit, segments) {
  const access = hit.station.accessPath;
  if (!access) return true;
  let walked = 0, next = 20, previousAt = hit.at;
  for (let i = 1; i < access.length && next <= 40; i++) {
    const a = access[i - 1], b = access[i];
    const lane = project(a, a, b);
    while (next <= 40 && next <= walked + lane.length) {
      const t = (next - walked) / lane.length;
      const point = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      const match = segments.some(segment => {
        if (segment.at + segment.length < previousAt || segment.at > hit.at + 140) return false;
        const p = project(point, segment.a, segment.b);
        const at = segment.at + p.t * p.length;
        if (at <= previousAt || at > hit.at + 140 || p.distance > (hit.station.accessToleranceMeters ?? 8)) return false;
        if ((p.dx * lane.dx + p.dy * lane.dy) / (p.length * lane.length) < .7) return false;
        previousAt = at;
        return true;
      });
      if (!match) return false;
      next += 20;
    }
    walked += lane.length;
  }
  return next > 40;
}

export function estimateCrossings(path, stations = namedStations) {
  const hits = []; let traveled = 0;
  const segments = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const scale = Math.cos((a[0] + b[0]) / 2 * Math.PI / 180);
    const dx = (b[1] - a[1]) * meters * scale, dy = (b[0] - a[0]) * meters;
    const length = Math.hypot(dx, dy);
    if (!length) continue;
    segments.push({ a, b, at: traveled, length });
    for (const station of stations) {
      if (station.active === false || /pr[oó]ximamente|en construcci[oó]n/i.test(station.name ?? '')) continue;
      if (station.lat < Math.min(a[0], b[0]) - .001 || station.lat > Math.max(a[0], b[0]) + .001 || station.lon < Math.min(a[1], b[1]) - .002 || station.lon > Math.max(a[1], b[1]) + .002) continue;
      const x = (station.lon - a[1]) * meters * scale, y = (station.lat - a[0]) * meters;
      const t = Math.max(0, Math.min(1, (x * dx + y * dy) / length ** 2));
      const distance = Math.hypot(x - t * dx, y - t * dy);
      if (distance <= (station.matchRadiusMeters ?? 18)) hits.push({ station, at: traveled + t * length, distance, dx: dx / length, dy: dy / length, direction: dy < 0 ? 'la-plata' : 'caba' });
    }
    traveled += length;
  }
  hits.sort((a,b) => a.at - b.at);
  const passes = [];
  for (const hit of hits) {
    if (!followsAccess(hit, segments)) continue;
    const last = passes.at(-1);
    // Collapse lanes and repeated nearby path vertices, but preserve a later return crossing.
    const samePlaza = last && (hit.station.plazaId && last.station.plazaId
      ? hit.station.plazaId === last.station.plazaId
      : Math.hypot((hit.station.lat-last.station.lat)*meters,(hit.station.lon-last.station.lon)*meters*Math.cos(hit.station.lat*Math.PI/180)) < 250);
    if (last && samePlaza && hit.at - last.at < 400 && hit.dx * last.dx + hit.dy * last.dy > .5) {
      if ((!last.station.name && hit.station.name) || (Boolean(last.station.name) === Boolean(hit.station.name) && hit.distance < last.distance)) passes[passes.length-1] = hit;
    } else passes.push(hit);
  }
  const occurrences = new Map();
  return passes.map(hit => {
    const station = hit.station;
    const identity = station.plazaId ?? station.id;
    const count = occurrences.get(identity) ?? 0; occurrences.set(identity, count + 1);
    const name = station.name || 'Peaje sin nombre (revisar)';
    const operator = station.operator ?? findPublication({ name }, 'tag').operator;
    const coastal = operator === 'aubasa' && station.lat < -35;
    return { id: 'osm:' + identity + ':' + count, name, locality: station.locality || '', road: station.road || '', province: station.province || '', amount: null, source: 'pending', payment: '', operator,
      travelSense: crossingSense(hit),
      direction: operator === 'aubasa' ? coastal ? 'both' : hit.direction : undefined,
      lookupMessage: 'Estación estimada sobre la ruta de Google. Revisá localidad, horario y tarifa.',
      stationSourceUrl: 'https://www.openstreetmap.org/node/' + station.id };
  });
}
export const catalogDate = catalog.date;

export function estimateLegCrossings(legs, isRoundTrip, stations = namedStations) {
  return legs.flatMap((leg, index) => {
    const journey = isRoundTrip && index === legs.length - 1 ? 'return' : 'outbound';
    return estimateCrossings(leg.path, stations).map(toll => ({
      ...toll, id: journey + ':leg-' + index + ':' + toll.id, journey,
      legIndex: index, legOrigin: leg.origin, legDestination: leg.destination
    }));
  });
}

export function estimateJourneyCrossings(path, returnStartIndex, stations = namedStations) {
  const groups = returnStartIndex === undefined
    ? [{ journey: 'outbound', path }]
    : [{ journey: 'outbound', path: path.slice(0, returnStartIndex) }, { journey: 'return', path: path.slice(returnStartIndex) }];
  return groups.flatMap(group => estimateCrossings(group.path, stations).map(toll => ({
    ...toll, id: group.journey + ':' + toll.id, journey: group.journey
  })));
}
