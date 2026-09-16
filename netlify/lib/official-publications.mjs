import { createHash } from 'node:crypto';
import publications from './verified-tariffs.json' with { type: 'json' };

export const normalizeStation = name => String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^(estacion\s+de\s+)?peaje\s+/, '').trim();
const allowedHosts = new Set(['aubasa.com.ar', 'www.ausol.com.ar', 'back.ausol.com.ar']);

// No arbitrary client URLs, redirect following, stale-price fallback or hidden CMS prices.
export async function readOfficial(url, fetcher = fetch) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname)) throw new Error('Fuente no habilitada.');
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Publicación no disponible.');
  const reader = response.body.getReader();
  const chunks = []; let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 6000000) { await reader.cancel(); throw new Error('Publicación demasiado grande.'); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export function findPublication(toll, payment) {
  if (!['tag', 'cash'].includes(payment)) return { reason: 'Seleccioná TelePASE o efectivo.' };
  const matches = publications.filter(p => p.operator === toll.operator && (p.stations.includes('*') || p.stations.includes(normalizeStation(toll.name))));
  if (!matches.length) return { reason: 'No hay una publicación verificada para esta concesionaria y estación. Cargá el importe manualmente.' };
  const source = matches.find(p => p.direction === 'both' || p.direction === toll.direction);
  if (!source) return { reason: 'Seleccioná el sentido de paso por esta estación.' };
  if (source.rates[payment].normal !== source.rates[payment].peak && !['normal', 'peak'].includes(toll.period)) return { reason: 'Seleccioná horario pico o no pico para esta pasada.' };
  return { source };
}

export async function searchOfficialTariffs(tolls, payment, fetcher = fetch) {
  // Deduplicate downloads within one lookup; never retain old prices after an error.
  const pending = new Map();
  const read = url => { if (!pending.has(url)) pending.set(url, readOfficial(url, fetcher)); return pending.get(url); };
  return Promise.all(tolls.map(async toll => {
    const base = { id: toll.id, amount: null, source: 'pending', checkedAt: new Date().toISOString() };
    const { source, reason } = findPublication(toll, payment);
    if (!source) return { ...base, lookupMessage: reason };
    try {
      let published = false;
      if (source.operator === 'aubasa') {
        const html = (await read(source.page)).toString('utf8');
        published = html.includes(source.document);
      } else {
        const page = JSON.parse((await read('https://back.ausol.com.ar/wp-json/wp/v2/pages/117')).toString('utf8'));
        const mediaId = page.acf?.imagen_de_la_tabla;
        if (page.acf?.mostrar_tabla_o_imagen !== 'imagen' || !Number.isSafeInteger(mediaId)) throw new Error('Formato de publicación nuevo.');
        const media = JSON.parse((await read('https://back.ausol.com.ar/wp-json/wp/v2/media/' + mediaId)).toString('utf8'));
        published = media.source_url === source.document;
      }
      if (!published) throw new Error('La concesionaria cambió su publicación.');
      const bytes = await read(source.document);
      if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw new Error('El cuadro tarifario cambió y requiere revisión.');
      return { ...base, amount: source.rates[payment][toll.period === 'peak' ? 'peak' : 'normal'], source: 'official', sourceUrl: source.document, sourcePage: source.page, category: source.category, lookupMessage: 'Publicación oficial verificada · 6 ejes · ARS' };
    } catch {
      return { ...base, sourcePage: source.page, lookupMessage: 'No se pudo verificar la publicación vigente. El importe queda pendiente de carga manual.' };
    }
  }));
}
