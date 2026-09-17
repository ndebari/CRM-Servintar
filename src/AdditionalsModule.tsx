import { SessionControls } from './SessionControls';
import { useState } from 'react';
import type { AdditionalDefinition } from './crmFeature';

export function AdditionalsModule({ catalog, onChange, status, embedded = false }: {
  embedded?: boolean;
  catalog: AdditionalDefinition[]; onChange: (items: AdditionalDefinition[]) => Promise<boolean>; status: string;
}) {
  const empty = (): AdditionalDefinition => ({ id: crypto.randomUUID(), name: '', description: '', kind: 'fixed' });
  const [editing, setEditing] = useState<AdditionalDefinition>(empty);
  const [error, setError] = useState('');
  const [removed, setRemoved] = useState<AdditionalDefinition | null>(null);
  const displayDate=(date?:string|null)=>date?new Date(date).toLocaleDateString('es-AR'):'Sin valor establecido';
  const existing = catalog.some(item => item.id === editing.id);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const item = { ...editing, name: editing.name.trim(), description: editing.description.trim() };
    if (!item.name) { setError('Completá el nombre del adicional.'); return; }
    if (item.amount === undefined || !Number.isFinite(item.amount) || item.amount < 0) { setError('Completá un valor referencial válido, mayor o igual a cero.'); return; }
    if (catalog.some(other => other.id !== item.id && other.name.trim().toLocaleLowerCase('es') === item.name.toLocaleLowerCase('es'))) {
      setError('Ya existe un adicional con ese nombre.'); return;
    }
    if (await onChange(existing ? catalog.map(other => other.id === item.id ? item : other) : [...catalog, item])) {
      setEditing(empty()); setError('');
    }
  };
  return <>
    {!embedded && <header className="topbar"><div><p className="eyebrow">Configuración</p><h1>Adicionales</h1><p className="page-description">Administrá los conceptos disponibles en el cotizador.</p></div><SessionControls /></header>}
    <section className="panel">
      <h2>{existing ? 'Editar adicional' : 'Nuevo adicional'}</h2>
      <form onSubmit={save}>
        <div className="form-grid">
          <label>Nombre del adicional<input required maxLength={100} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></label>
          <label>Descripción<input maxLength={500} value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} /></label>
          <label>Comportamiento<select value={editing.kind} onChange={e => setEditing({ ...editing, kind: e.target.value as AdditionalDefinition['kind'] })}><option value="fixed">$ · Importe fijo</option><option value="percent">% · Del transporte</option></select></label>
          <label>{editing.kind === 'percent' ? 'Porcentaje referencial (%)' : 'Valor referencial ($)'}<input required type="number" min="0" step="0.01" value={editing.amount ?? ''} onChange={e => setEditing({...editing,amount:e.target.value === '' ? undefined : e.target.valueAsNumber})} /></label>
        </div>
        <p className="muted-copy">El valor referencial se propone en el cotizador y puede editarse para cada viaje. El % se aplica a la tarifa cotizada de transporte, luego de costos y utilidad.</p>
        <p className="muted-copy">Al guardar los costos del mes, los importes en $ se ajustan con su índice ponderado. Los porcentajes se mantienen. Las cotizaciones guardadas conservan sus valores.</p>
        {existing&&<p className="muted-copy">Fecha de creación del valor: {displayDate(editing.valueCreatedAt)}</p>}
        {error && <p role="alert">{error}</p>}
        <button className="primary-button" type="submit">{existing ? 'Guardar cambios' : 'Crear adicional'}</button>{existing && <button className="ghost-button" type="button" onClick={() => {setEditing(empty());setError('');}}>Cancelar</button>}
      </form>
      <p role="status">{status}</p>
      <p className="muted-copy">Catálogo compartido en Supabase. Los cambios se aplican al agregar adicionales nuevos; conservamos los ya incorporados en cotizaciones.</p>
    </section>
    <section className="panel"><h2>Catálogo de adicionales</h2>
      {removed && <p role="status">Se quitó {removed.name}. <button className="ghost-button" onClick={async () => {if(await onChange([...catalog, removed]))setRemoved(null);}}>Deshacer baja</button></p>}
      {!catalog.length && <p>No hay adicionales. Creá el primero con el formulario.</p>}
      <div className="additional-list">{catalog.map(item => <article className="additional-row catalog-row" key={item.id}>
        <div><strong>{item.name}</strong><p>{item.description || 'Sin descripción'}</p><small>Valor creado: {displayDate(item.valueCreatedAt)}{item.valueUpdatedAt && ' · Actualizado: '+displayDate(item.valueUpdatedAt)}{item.lastAdjustmentMonth && ' · Ajuste de costos: '+item.lastAdjustmentMonth}</small></div>
        <span>{item.amount === undefined ? 'Sin valor referencial' : item.kind === 'percent' ? `${item.amount}% del transporte` : new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(item.amount)}</span>
        <button className="ghost-button" aria-label={'Editar adicional ' + item.name} onClick={() => {setEditing({...item});setError('');}}>Editar</button>
        <button className="ghost-button" aria-label={'Dar de baja ' + item.name} onClick={async () => {if(await onChange(catalog.filter(other => other.id !== item.id))){setRemoved(item);if(editing.id === item.id)setEditing(empty());}}}>Dar de baja</button>
      </article>)}</div>
    </section>
  </>;
}
