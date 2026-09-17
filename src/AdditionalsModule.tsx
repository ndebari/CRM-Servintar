import { useState } from 'react';
import type { AdditionalDefinition } from './crmFeature';

export function AdditionalsModule({ catalog, onChange, status, embedded = false }: {
  embedded?: boolean;
  catalog: AdditionalDefinition[]; onChange: (items: AdditionalDefinition[]) => boolean; status: string;
}) {
  const empty = (): AdditionalDefinition => ({ id: crypto.randomUUID(), name: '', description: '', kind: 'fixed' });
  const [editing, setEditing] = useState<AdditionalDefinition>(empty);
  const [error, setError] = useState('');
  const [removed, setRemoved] = useState<AdditionalDefinition | null>(null);
  const existing = catalog.some(item => item.id === editing.id);
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const item = { ...editing, name: editing.name.trim(), description: editing.description.trim() };
    if (!item.name) { setError('Completá el nombre del adicional.'); return; }
    if (item.amount === undefined || !Number.isFinite(item.amount) || item.amount < 0) { setError('Completá un valor base válido, mayor o igual a cero.'); return; }
    if (catalog.some(other => other.id !== item.id && other.name.trim().toLocaleLowerCase('es') === item.name.toLocaleLowerCase('es'))) {
      setError('Ya existe un adicional con ese nombre.'); return;
    }
    if (onChange(existing ? catalog.map(other => other.id === item.id ? item : other) : [...catalog, item])) {
      setEditing(empty()); setError('');
    }
  };
  return <>
    {!embedded && <header className="topbar"><div><p className="eyebrow">Configuración</p><h1>Adicionales</h1><p className="page-description">Administrá los conceptos disponibles en el cotizador.</p></div></header>}
    <section className="panel">
      <h2>{existing ? 'Editar adicional' : 'Nuevo adicional'}</h2>
      <form onSubmit={save}>
        <div className="form-grid">
          <label>Nombre del adicional<input required maxLength={100} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></label>
          <label>Descripción<input maxLength={500} value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} /></label>
          <label>Tipo de adicional<select value={editing.kind} onChange={e => setEditing({ ...editing, kind: e.target.value as AdditionalDefinition['kind'] })}><option value="fixed">$ · Importe fijo</option><option value="percent">% · Del transporte</option></select></label>
          <label>{editing.kind === 'percent' ? 'Porcentaje base (%)' : 'Importe base ($)'}<input required type="number" min="0" step="0.01" value={editing.amount ?? ''} onChange={e => setEditing({...editing,amount:e.target.value === '' ? undefined : e.target.valueAsNumber})} /></label>
        </div>
        <p className="muted-copy">El valor base se propone en el cotizador y puede editarse para cada viaje. El % se aplica al transporte base (kilómetros + días).</p>
        {error && <p role="alert">{error}</p>}
        <button className="primary-button" type="submit">{existing ? 'Guardar cambios' : 'Crear adicional'}</button>{existing && <button className="ghost-button" type="button" onClick={() => {setEditing(empty());setError('');}}>Cancelar</button>}
      </form>
      <p role="status">{status}</p>
      <p className="muted-copy">Catálogo guardado en este navegador. Los cambios se aplican al agregar adicionales nuevos; conservamos los ya incorporados en cotizaciones.</p>
    </section>
    <section className="panel"><h2>Catálogo de adicionales</h2>
      {removed && <p role="status">Se quitó {removed.name}. <button className="ghost-button" onClick={() => {if(onChange([...catalog, removed]))setRemoved(null);}}>Deshacer baja</button></p>}
      {!catalog.length && <p>No hay adicionales. Creá el primero con el formulario.</p>}
      <div className="additional-list">{catalog.map(item => <article className="additional-row catalog-row" key={item.id}>
        <div><strong>{item.name}</strong><p>{item.description || 'Sin descripción'}</p></div>
        <span>{item.amount === undefined ? 'Sin valor base' : item.kind === 'percent' ? `${item.amount}% del transporte` : new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(item.amount)}</span>
        <button className="ghost-button" aria-label={'Editar adicional ' + item.name} onClick={() => {setEditing({...item});setError('');}}>Editar</button>
        <button className="ghost-button" aria-label={'Dar de baja ' + item.name} onClick={() => {if(onChange(catalog.filter(other => other.id !== item.id))){setRemoved(item);if(editing.id === item.id)setEditing(empty());}}}>Dar de baja</button>
      </article>)}</div>
    </section>
  </>;
}
