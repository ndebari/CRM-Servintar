import { useEffect, useState } from 'react';
import { supabase } from './supabase';
type UserAccess = {email:string; approvedAt:string; registered:boolean; confirmed:boolean; admin:boolean};
export function AdminUsers() {
 const [users,setUsers]=useState<UserAccess[]>([]);
 const [email,setEmail]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
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
   await load();
  }catch(e){setError(e instanceof Error?e.message:(e as {message?:string})?.message||'No se pudo actualizar el acceso.');}
  finally{setBusy(false);}
 };
 return <section className="panel admin-users"><h2>Administración de usuarios</h2>
 <p>Autorizá el correo antes de que la persona cree su usuario. Los usuarios nuevos no pueden autorizar a otras personas.</p>
 <form onSubmit={e=>{e.preventDefault();void save(email,true);}}>
 <label>Correo del nuevo usuario<input type="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></label>
 <button className="primary-button" disabled={busy}>Autorizar usuario</button></form>
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <div className="table-wrap"><table><thead><tr><th>Correo</th><th>Rol</th><th>Estado</th><th>Acceso</th></tr></thead><tbody>
 {users.map(user=><tr key={user.email}><td>{user.email}</td><td>{user.admin?'Administrador':'Usuario'}</td><td>{user.confirmed?'Correo confirmado':user.registered?'Pendiente de confirmar correo':'Pendiente de registro'}</td><td>{user.admin?'Administrador principal':<button className="ghost-button" disabled={busy} onClick={()=>void save(user.email,false)}>Revocar acceso</button>}</td></tr>)}
 </tbody></table></div></section>;
}
