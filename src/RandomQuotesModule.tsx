import { useEffect, useState } from 'react';
import { SessionControls } from './SessionControls';
import { crmRpc } from './quoteDatabase';
import type { PreparedQuote } from './crmFeature';

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

export function RandomQuotesModule({ focusId, onCreate }: { focusId?: string; onCreate: () => void }) {
  const [quotes, setQuotes] = useState<PreparedQuote[]>([]);
  const [selectedId, setSelectedId] = useState(focusId || '');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void crmRpc<PreparedQuote[]>('crm_read_random_quotes').then(data => {
      if (active) setQuotes(data);
    }).catch(() => {
      if (active) setError('No se pudieron cargar las cotizaciones random. Verificá la conexión y que la sección esté habilitada en Supabase.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);
  const selected = quotes.find(quote => quote.id === selectedId);
  const filtered = quotes.filter(quote => `${quote.number} ${quote.summary} ${quote.draft?.operationDescription || ''}`.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es')));
  return <div className="module-frame">
    <header className="topbar"><h1>Cotizaciones random</h1><SessionControls /></header>
    <div className="module-scroll">
      <section className="panel">
        <div className="panel-header"><h2>Consultas sin cliente</h2><button className="primary-button" type="button" onClick={onCreate}>Nueva consulta</button></div>
        <p className="muted-copy">Consultas guardadas al obtener la tarifa final. No requieren cliente ni contacto.</p>
        <label>Buscar consulta<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Número, servicio o descripción" /></label>
        {loading && <p role="status">Cargando consultas…</p>}
        {error && <p role="alert">{error} <button type="button" className="ghost-button" onClick={() => setReload(value => value + 1)}>Reintentar</button></p>}
        {!loading && !error && (!filtered.length ? <p>No hay consultas para mostrar.</p> : <div className="quote-table-scroll"><table className="quote-register-table">
          <thead><tr><th>Número</th><th>Fecha</th><th>Servicio</th><th>Tarifa final</th></tr></thead>
          <tbody>{filtered.map(quote => <tr key={quote.id}><td><button className="ghost-button" type="button" onClick={() => setSelectedId(quote.id)}>{quote.number}</button></td><td>{new Date(quote.createdAt!).toLocaleString('es-AR')}</td><td>{quote.summary}</td><td>{money.format(quote.amount)}</td></tr>)}</tbody>
        </table></div>)}
      </section>
      {selected && <section className="panel quote-record" aria-label="Detalle de consulta">
        <div className="panel-header"><h2>{selected.number} · Consulta sin cliente</h2><button className="ghost-button" type="button" onClick={() => setSelectedId('')}>Cerrar detalle</button></div>
        <div className="toll-total"><span>Tarifa final</span><strong>{money.format(selected.amount)}</strong></div>
        <pre className="quote-record-text">{selected.text}</pre>
      </section>}
    </div>
  </div>;
}
