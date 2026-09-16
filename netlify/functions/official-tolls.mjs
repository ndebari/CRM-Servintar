import { searchOfficialTariffs } from '../lib/official-publications.mjs';
const reply = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
export async function handler(event) {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Método no permitido.' });
  if ((event.body?.length ?? 0) > 30000) return reply(413, { error: 'Solicitud demasiado grande.' });
  let input;
  try { input = JSON.parse(event.body ?? '{}'); } catch { return reply(400, { error: 'Solicitud inválida.' }); }
  if (!Array.isArray(input.tolls) || input.tolls.length > 30 || input.axles !== 6 || input.tolls.some(t => !t || typeof t.id !== 'string' || t.id.length > 150 || typeof t.name !== 'string' || t.name.length > 200)) return reply(400, { error: 'Indicá las estaciones y el vehículo de seis ejes.' });
  return reply(200, { tolls: await searchOfficialTariffs(input.tolls, input.payment) });
}
