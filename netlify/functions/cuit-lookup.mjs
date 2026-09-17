const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const reply = (statusCode, data) => ({ statusCode, headers, body: JSON.stringify(data) });
export function validCuit(cuit) {
  if (!/^\d{11}$/.test(cuit) || /^0+$/.test(cuit)) return false;
  const sum = [5,4,3,2,7,6,5,4,3,2].reduce((total, weight, i) => total + weight * Number(cuit[i]), 0);
  return (11 - sum % 11) % 11 === Number(cuit[10]);
}
function decode(text) {
  const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ' };
  return text.replace(/<[^>]*>/g, '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (full, key) => {
    if (!key.startsWith('#')) return entities[key] ?? full;
    const code = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }).replace(/\s+/g, ' ').trim();
}
export function parseCompany(html, cuit) {
  // Only accept the name inside a detail link for the exact requested CUIT.
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = new URL(match[1], 'https://www.cuitonline.com/');
    if (url.origin !== 'https://www.cuitonline.com' || !url.pathname.startsWith('/detalle/' + cuit + '/')) continue;
    const heading = match[2].match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
    const businessName = heading && decode(heading[1]);
    if (businessName && businessName.length <= 250) return { cuit, businessName, source: url.href, provider: 'CUIT Online' };
  }
  return null;
}
export async function handler(event) {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Método no permitido.' });
  if ((event.body || '').length > 200) return reply(400, { error: 'Solicitud inválida.' });
  let cuit;
  try { cuit = JSON.parse(event.body).cuit; } catch { return reply(400, { error: 'Solicitud inválida.' }); }
  if (typeof cuit !== 'string' || !validCuit(cuit)) return reply(400, { error: 'CUIT inválido.' });
  try {
    const response = await fetch('https://www.cuitonline.com/search.php?q=' + cuit, { signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (!response.ok) throw new Error('Source unavailable');
    const html = await response.text();
    if (html.length > 2000000) throw new Error('Unexpected response');
    const company = parseCompany(html, cuit);
    return company ? reply(200, company) : reply(404, { error: 'No se encontró una razón social para ese CUIT. Completala manualmente.' });
  } catch { return reply(502, { error: 'No se pudo consultar la fuente pública. Reintentá o completá la razón social manualmente.' }); }
}
