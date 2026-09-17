import { AdminUsers } from './AdminUsers';
import { SessionContext, SessionControls } from './SessionControls';
import { useContext, useState } from 'react';
import { AdditionalsModule } from './AdditionalsModule';
import type { AdditionalDefinition, Client } from './crmFeature';

export function AbmModule({ additionalCatalog, onAdditionalsChange, additionalStatus, clientTypes, clients, onClientTypesChange }: {
  additionalCatalog: AdditionalDefinition[];
  onAdditionalsChange: (items: AdditionalDefinition[]) => Promise<boolean>;
  additionalStatus: string;
  clientTypes: string[];
  clients: Client[];
  onClientTypesChange: (types: string[], rename?: { from: string; to: string }) => Promise<boolean>;
}) {
  const [section, setSection] = useState<'additionals' | 'types' | 'users'>('additionals');
  const admin=useContext(SessionContext)?.admin===true;
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [removed, setRemoved] = useState<string | null>(null);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); const value = name.trim();
    if (!value) { setMessage('Completá el nombre del tipo de cliente.'); return; }
    if (clientTypes.some(type => type !== editing && type.toLocaleLowerCase('es') === value.toLocaleLowerCase('es'))) { setMessage('Ya existe un tipo con ese nombre.'); return; }
    if (!await onClientTypesChange(editing === null ? [...clientTypes, value] : clientTypes.map(type => type === editing ? value : type), editing === null ? undefined : { from: editing, to: value })) { setMessage('No se pudo guardar en Supabase.'); return; }
    setName(''); setEditing(null); setMessage('Tipo de cliente guardado.');
  };
  return <>
    <header className="topbar"><div><p className="eyebrow">Configuración</p><h1>ABM</h1></div><SessionControls /></header>
    {!admin?<p>La administración de usuarios y catálogos está disponible para el administrador.</p>:<><nav className="abm-navigation" aria-label="Catálogos ABM">
      <button className={section === 'additionals' ? 'primary-button' : 'ghost-button'} aria-pressed={section === 'additionals'} onClick={() => setSection('additionals')}>Adicionales</button>
      <button className={section === 'types' ? 'primary-button' : 'ghost-button'} aria-pressed={section === 'types'} onClick={() => setSection('types')}>Tipos de cliente</button>
      <button className={section === 'users' ? 'primary-button' : 'ghost-button'} aria-pressed={section === 'users'} onClick={()=>setSection('users')}>Usuarios</button>
    </nav>
    {section === 'users' ? <AdminUsers clients={clients}/> : section === 'additionals' ? <AdditionalsModule embedded catalog={additionalCatalog} onChange={onAdditionalsChange} status={additionalStatus} /> : <>
      <section className="panel"><h2>{editing === null ? 'Nuevo tipo de cliente' : 'Editar tipo de cliente'}</h2>
        <form onSubmit={save}><div className="form-grid"><label>Nombre del tipo<input required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label></div>
          <button className="primary-button" type="submit">{editing === null ? 'Crear tipo' : 'Guardar cambios'}</button>
          {editing !== null && <button className="ghost-button" type="button" onClick={() => { setName(''); setEditing(null); setMessage(''); }}>Cancelar</button>}
        </form><p role="status">{message}</p>
        <p className="muted-copy">Los tipos se guardan en Supabase. Al renombrar un tipo se actualizan los clientes cargados que lo utilizan.</p>
      </section>
      <section className="panel"><h2>Tipos de cliente</h2>
        {removed && <p>Se quitó {removed}. <button className="ghost-button" onClick={async () => { if (clientTypes.some(type => type.toLocaleLowerCase('es') === removed.toLocaleLowerCase('es'))) { setMessage('Ya existe un tipo con ese nombre.'); return; } if (await onClientTypesChange([...clientTypes, removed])) setRemoved(null); }}>Deshacer baja</button></p>}
        {!clientTypes.length && <p>Todavía no hay tipos de cliente.</p>}
        <div className="entity-list">{clientTypes.map(type => {
          const used = clients.some(client => client.type === type);
          return <div className="entity-row" key={type}><div><strong>{type}</strong>{used && <span>En uso por clientes</span>}</div>
            <button className="ghost-button" aria-label={'Editar tipo ' + type} onClick={() => { setEditing(type); setName(type); setMessage(''); }}>Editar</button>
            <button className="ghost-button" disabled={used} title={used ? 'Asigná otro tipo a esos clientes antes de darlo de baja.' : undefined} aria-label={'Dar de baja tipo ' + type} onClick={async () => { if (await onClientTypesChange(clientTypes.filter(item => item !== type))) { setRemoved(type); if (editing === type) {setEditing(null);setName('');} setMessage('Tipo dado de baja.'); } }}>Dar de baja</button>
          </div>;
        })}</div>
      </section>
    </>}</>}
  </>;
}
