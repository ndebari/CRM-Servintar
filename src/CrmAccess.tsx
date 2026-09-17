import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { AdminUsers } from './AdminUsers';
import { SessionContext } from './SessionControls';
export function CrmAccess({children}:{children:ReactNode}) {
 const [session,setSession]=useState<Session|null>(null);const [loading,setLoading]=useState(true);const [allowedUser,setAllowedUser]=useState('');
 const [admin,setAdmin]=useState(false);const [showUsers,setShowUsers]=useState(false);
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [signup,setSignup]=useState(false);
 useEffect(()=>{
  if(!supabase){setLoading(false);setMessage('Supabase no está configurado.');return;}
  let active=true;
  void supabase.auth.getSession().then(({data,error})=>{if(active){setSession(data.session);if(error)setMessage('No se pudo recuperar la sesión.');setLoading(false);}});
  const {data}=supabase.auth.onAuthStateChange((_event,next)=>{if(active){setSession(next);}});
  return()=>{active=false;data.subscription.unsubscribe();};
 },[]);
 useEffect(()=>{
  setAdmin(false);setShowUsers(false);if(!session || !supabase)return;let active=true;setLoading(true);
  void supabase.rpc('crm_claim_access').then(({data,error})=>{if(active){setAllowedUser(data===true&&!error?session.user.id:'');setMessage(error?'No se pudo verificar el acceso. Reintentá.':data===true?'':'Tu usuario todavía no está autorizado para este CRM.');setLoading(false);}});
  void supabase.rpc('crm_is_admin').then(({data,error})=>{if(active)setAdmin(data===true&&!error);});
  return()=>{active=false;};
 },[session?.user.id]);
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();if(!supabase)return;setBusy(true);setMessage('');
  try {
   const result=signup?await supabase.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:window.location.origin}}):await supabase.auth.signInWithPassword({email:email.trim(),password});
   if(result.error)throw new Error(signup&&result.error.message.toLowerCase().includes('database error')?'No se pudo crear el usuario. Verificá que el administrador haya autorizado este correo.':result.error.message);
   setPassword('');if(signup&&!result.data.session)setMessage('Confirmá tu correo con el enlace recibido y luego ingresá.');
  }catch(error){setMessage(error instanceof Error?error.message:'No se pudo iniciar sesión.');}finally{setBusy(false);}
 };
 if(loading)return <main className="auth-screen"><section className="panel"><h1>CRM Servintar</h1><p>Verificando acceso…</p></section></main>;
 if(session&&allowedUser===session.user.id)return <SessionContext.Provider value={{email:session.user.email||'',admin,showUsers,toggleUsers:()=>setShowUsers(!showUsers),signOut:()=>void supabase?.auth.signOut()}}>{admin&&showUsers&&<AdminUsers/>}{children}</SessionContext.Provider>;
 return <main className="auth-screen"><section className="panel"><p className="eyebrow">Servintar</p><h1>{session?'Acceso al CRM':signup?'Crear usuario':'Ingresar al CRM'}</h1>
 {session?<><p role="alert">{message}</p><button className="primary-button" onClick={()=>window.location.reload()}>Verificar acceso</button><button className="ghost-button" onClick={()=>void supabase?.auth.signOut()}>Cerrar sesión</button></>:<form onSubmit={submit}>
 {signup&&<p>Solo podés crear tu usuario si el administrador autorizó previamente tu correo.</p>}
 <label>Correo<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <label>Contraseña<input type="password" required minLength={8} autoComplete={signup?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>
 {message&&<p role="status">{message}</p>}<button type="submit" className="primary-button" disabled={busy}>{busy?'Procesando…':signup?'Crear usuario':'Ingresar'}</button>
 <button type="button" className="ghost-button" disabled={busy} onClick={()=>{setSignup(!signup);setMessage('');}}>{signup?'Ya tengo usuario':'Crear usuario autorizado'}</button>
 </form>}</section></main>;
}
