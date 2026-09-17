import { SessionControls } from './SessionControls';
import { useState } from 'react';
import { getClientContacts, type Client, type PreparedQuote } from './crmFeature';
const money = new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'});
const day = (value:string) => { const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); };
const date = (value?:string) => value ? new Date(value).toLocaleString('es-AR') : 'Sin registrar';
export function QuotesModule({ clients, quotes, priceList = false, onChange, onRequote, focusId }: {
 clients:Client[]; quotes:PreparedQuote[]; priceList?:boolean; focusId?:string;
 onChange:(id:string,action:'send'|'approve',contactKey?:string)=>Promise<void>;
 onRequote:(quote:PreparedQuote)=>void;
}) {
 const initial=quotes.find(q=>q.id===focusId);
 const [clientId,setClientId]=useState(initial?.clientId || '');
 const [state,setState]=useState(''); const [from,setFrom]=useState(''); const [to,setTo]=useState('');
 const [selectedId,setSelectedId]=useState(focusId || '');
 const [contactKey,setContactKey]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const options=new Map(clients.map(c=>[c.id,c.alias || c.businessName]));
 for(const q of quotes) if(!options.has(q.clientId))options.set(q.clientId,q.clientName || 'Cliente archivado');
 const selected=quotes.find(q=>q.id===selectedId);
 const filtered=clientId ? quotes.filter(q=>q.clientId===clientId && (!priceList || q.state==='Aprobada') && (!state || q.state===state) && (!from || day(q.createdAt || q.quoteDate)>=from) && (!to || day(q.createdAt || q.quoteDate)<=to)).sort((a,b)=>(b.createdAt || b.quoteDate).localeCompare(a.createdAt || a.quoteDate)) : [];
 const family=selected ? quotes.filter(q=>(q.rootId || q.id)===(selected.rootId || selected.id)).sort((a,b)=>(a.revision || 0)-(b.revision || 0)) : [];
 const open=(q:PreparedQuote)=>{setSelectedId(q.id);setClientId(q.clientId);setContactKey('');setError('');};
 const change=async(action:'send'|'approve')=>{if(!selected)return;setBusy(true);setError('');try{await onChange(selected.id,action,contactKey);}catch(e){setError(e instanceof Error?e.message:'No se pudo guardar el estado.');}finally{setBusy(false);}};
 return <>
  <header className="topbar"><div><p className="eyebrow">Módulo</p><h1>{priceList?'Tarifas vigentes':'Cotizaciones'}</h1></div><SessionControls /></header>
  <section className="panel"><div className="form-grid">
   <label>Cliente<select value={clientId} onChange={e=>{setClientId(e.target.value);setSelectedId('');setError('');}}><option value="">Seleccionar cliente</option>{[...options].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
   <label>Creada desde<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
   <label>Creada hasta<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
   {!priceList && <label>Estado<select value={state} onChange={e=>setState(e.target.value)}><option value="">Todos</option>{['Pendiente de envio','Enviada / pendiente','Aprobada','Recotizada'].map(s=><option key={s}>{s}</option>)}</select></label>}
  </div><button type="button" className="ghost-button" onClick={()=>{setClientId('');setSelectedId('');setState('');setFrom('');setTo('');}}>Limpiar filtros</button></section>
  {!clientId ? <p className="muted-copy">Seleccioná un cliente para ver {priceList?'sus tarifas aprobadas':'sus cotizaciones'}.</p> : <section className="panel quote-register">
   <h2>{priceList?'Tarifas aprobadas':'Cotizaciones del cliente'}</h2>
   {!filtered.length ? <p>No hay registros para estos filtros.</p> : <div className="quote-table-scroll"><table className="quote-register-table"><thead><tr><th>Número</th><th>Fecha de creación</th><th>Servicio</th><th>Estado</th><th>Tarifa</th></tr></thead><tbody>{filtered.map(q=><tr key={q.id}><td><button className="ghost-button" type="button" onClick={()=>open(q)}>{q.number}</button></td><td>{date(q.createdAt)}</td><td>{q.summary}</td><td>{q.state}</td><td>{money.format(q.amount)}</td></tr>)}</tbody></table></div>}
  </section>}
  {selected && selected.clientId===clientId && <section className="panel quote-record" aria-label="Detalle de cotización">
   <div className="panel-header"><h2>{selected.number} · {selected.clientName}</h2><button className="ghost-button" type="button" onClick={()=>setSelectedId('')}>Cerrar detalle</button></div>
   <p>{selected.state} · Creada: {date(selected.createdAt)}</p>
   {selected.sentTo && <p>Enviada a {selected.sentTo.fullName}{selected.sentTo.email?' · '+selected.sentTo.email:''} · {date(selected.sentAt)}</p>}
   {selected.approvedAt && <p>Aprobada: {date(selected.approvedAt)}</p>}
   {family.length>1 && <nav className="quote-family" aria-label="Original y recotizaciones">{family.map(q=><button type="button" className="ghost-button" key={q.id} disabled={q.id===selected.id} onClick={()=>open(q)}>{q.revision?'Recotización':'Original'} {q.number}</button>)}</nav>}
   {error && <p role="alert">{error}</p>}
   {selected.state==='Pendiente de envio' && <div className="form-grid"><label>Contacto al que se envió<select value={contactKey} onChange={e=>setContactKey(e.target.value)}><option value="">Seleccionar contacto</option>{getClientContacts(clients.find(c=>c.id===selected.clientId) || selected.clientSnapshot).map(c=><option key={c.key} value={c.key}>{c.contact.fullName} · {c.label}</option>)}</select></label><button className="primary-button" type="button" disabled={!contactKey || busy} onClick={()=>void change('send')}>Registrar como enviada</button></div>}
   {selected.state==='Enviada / pendiente' && <div className="quote-family"><button className="primary-button" type="button" disabled={busy} onClick={()=>void change('approve')}>Aprobar y pasar a lista de precios</button><button className="ghost-button" type="button" disabled={busy || !selected.draft} onClick={()=>onRequote(selected)}>Recotizar</button>{!selected.draft && <p>Este registro antiguo no conserva los datos del cotizador.</p>}</div>}
   <pre className="quote-record-text">{selected.text}</pre>
  </section>}
 </>;
}
