import type { PreparedQuote, ContactInfo } from './crmFeature';
export function quoteNumber(sequence: number, revision = 0) {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 99999) throw new Error('Se agotó la numeración de cinco dígitos.');
  return 'C-' + String(sequence).padStart(5, '0') + (revision ? '-R-' + String(revision).padStart(2, '0') : '');
}
export function registerQuote(input: PreparedQuote, existing: PreparedQuote[], sequence: number, parentId?: string, now = new Date().toISOString()) {
  const parent = parentId ? existing.find(q => q.id === parentId) : undefined;
  if (parentId && (!parent || parent.state !== 'Enviada / pendiente')) throw new Error('La cotización de origen ya no está pendiente de respuesta.');
  if (parent && parent.clientId !== input.clientId) throw new Error('La recotización debe pertenecer al mismo cliente.');
  const rootId = parent ? parent.rootId || parent.id : input.id;
  const revision = parent ? Math.max(0, ...existing.filter(q => (q.rootId || q.id) === rootId).map(q => q.revision || 0)) + 1 : 0;
  const baseSequence = parent?.sequence || sequence;
  const number = quoteNumber(baseSequence, revision);
  const quote: PreparedQuote = { ...input, number, sequence: baseSequence, revision, rootId, parentId, createdAt: now,
    state: 'Pendiente de envio', requiredAction: 'Enviar al cliente', sentAt: undefined, sentTo: undefined, approvedAt: undefined,
    text: number + '\n' + input.text };
  return { quote, parent: parent ? { ...parent, state: 'Recotizada' as const, requiredAction: 'Consultar recotización' } : undefined };
}
export function transitionQuote(quote: PreparedQuote, action: 'send' | 'approve', contact?: ContactInfo, now = new Date().toISOString()): PreparedQuote {
  if (action === 'send') {
    if (quote.state !== 'Pendiente de envio' || !contact?.fullName.trim()) throw new Error('Seleccioná el contacto al que se envió la cotización.');
    return { ...quote, state: 'Enviada / pendiente', sentTo: { ...contact }, sentAt: now, requiredAction: 'Esperar aprobación' };
  }
  if (quote.state !== 'Enviada / pendiente' || !quote.sentTo) throw new Error('Primero registrá el envío y su destinatario.');
  return { ...quote, state: 'Aprobada', approvedAt: now, requiredAction: '' };
}
export function migrateQuotes(items: PreparedQuote[]) {
  let sequence = Math.max(0, ...items.map(q => q.sequence || 0));
  return [...items].sort((a,b) => (a.createdAt || a.quoteDate).localeCompare(b.createdAt || b.quoteDate)).map(q => {
    if (q.number && q.sequence) return q;
    const next = ++sequence;
    return { ...q, number: quoteNumber(next), sequence: next, revision: 0, rootId: q.id,
      createdAt: q.createdAt || q.quoteDate + 'T12:00:00.000Z',
      state: q.state === 'Aprobada' ? 'Aprobada' as const : 'Pendiente de envio' as const };
  });
}
