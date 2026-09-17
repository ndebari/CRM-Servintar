import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Client } from './crmFeature';
type UserAccess = {email:string; approvedAt:string; registered:boolean; confirmed:boolean; admin:boolean;clientIds:string[]};
export function AdminUsers({clients}:{clients:Client[]}) {
 const [users,setUsers]=useState<UserAccess[]>([]);
 const [email,setEmail]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [selected,setSelected]=useState('');
 const [assigned,setAssigned]=useState<string[]>([]);
 const [search,setSearch]=useState('');
 const load=async()=>{
  const result=await supabase!.rpc('crm_admin_users');
  if(result.error)throw result.error;
  setUsers(result.data as UserAccess[]);
 };
 useEffect(()=>{void load().catch(()=>setError('No se pudo cargar el listado. Cerrá y volvé a abrir Usuarios.'));},[]);
 const save=async(address:string,allowed:boolean)=>{
  if(!allowed&&!window.confirm(`¿Revocar el acceso de ${address}? Ya no podrá consultar ni modificar el CRM.`))return;
  setBusy(true);setError('');setNotice('');
  try {
   const result=await supabase!.rpc('crm_admin_authorize',{p_email:address,p_allowed:allowed});
   if(result.error)throw result.error;
   setNotice(allowed?'Correo autorizado. Esa persona ya puede crear su usuario y confirmar su correo.':'Acceso revocado.');
   if(allowed)setEmail('');
   if(!allowed&&selected===address)setSelected('');
   await load();
  }catch(e){setError(e instanceof Error?e.message:(e as {message?:string})?.message||'No se pudo actualizar el acceso.');}
  finally{setBusy(false);}
 };
 const saveClients=async()=>{
  setBusy(true);setError('');setNotice('');
  try {
   const result=await supabase!.rpc('crm_admin_set_clients',{p_email:selected,p_client_ids:assigned});
   if(result.error)throw result.error;
   await load();setSelected('');setNotice('Clientes asignados actualizados.');
  }catch(e){setError((e as {message?:string})?.message||'No se pudieron guardar los clientes.');}
  finally{setBusy(false);}
 };
 return <section className="panel admin-users"><h2>Administración de usuarios</h2>
 <p>Autorizá el correo y asignale los clientes que podrá ver. Un usuario sin clientes asignados no verá clientes ni cotizaciones.</p>
 <form onSubmit={e=>{e.preventDefault();void save(email,true);}}>
 <label>Correo del nuevo usuario<input type="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></label>
 <button className="primary-button" disabled={busy}>Autorizar usuario</button></form>
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <div className="table-wrap"><table><thead><tr><th>Correo</th><th>Rol</th><th>Estado</th><th>Acceso</th></tr></thead><tbody>
 {users.map(user=><tr key={user.email}><td>{user.email}</td><td>{user.admin?'Administrador':'Usuario'}</td><td>{user.confirmed?'Correo confirmado':user.registered?'Pendiente de confirmar correo':'Pendiente de registro'}</td><td>{user.admin?'Todos los clientes':<><button className="ghost-button" disabled={busy} onClick={()=>{setSelected(user.email);setAssigned(user.clientIds||[]);setSearch('');setError('');setNotice('');}}>Clientes ({user.clientIds?.length||0})</button><button className="ghost-button" disabled={busy} onClick={()=>void save(user.email,false)}>Revocar acceso</button></>}</td></tr>)}
 </tbody></table></div>
 {selected&&<form onSubmit={e=>{e.preventDefault();void saveClients();}} className="user-clients-form">
 <h3>Clientes de {selected}</h3><label>Buscar cliente<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nombre de fantasía o razón social"/></label>
 <fieldset disabled={busy}><legend>Seleccioná los clientes visibles</legend>
 {clients.filter(c=>`${c.alias} ${c.businessName}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(c=><label className="user-client-option" key={c.id}><input type="checkbox" checked={assigned.includes(c.id)} onChange={e=>setAssigned(e.target.checked?[...assigned,c.id]:assigned.filter(id=>id!==c.id))}/><span>{c.alias||c.businessName}</span></label>)}
 {!clients.length&&<p>Todavía no hay clientes creados.</p>}</fieldset>
 <p>{assigned.length} clientes seleccionados. Sus cotizaciones y listas de precios tendrán la misma visibilidad.</p>
 <button className="primary-button" disabled={busy}>Guardar clientes</button><button type="button" className="ghost-button" disabled={busy} onClick={()=>setSelected('')}>Cancelar</button>
 </form>}</section>;
}
