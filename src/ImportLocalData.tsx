import { useState } from 'react';
import { crmRpc } from './quoteDatabase';
import { migrateQuotes } from './quoteLifecycle';
import { validateCuit, type Client, type PreparedQuote, type AdditionalDefinition } from './crmFeature';
type Bundle={clients:Client[];quotes:PreparedQuote[];clientTypes:string[];additionals:AdditionalDefinition[]};
function savedArray<T>(key:string):T[]{const value=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(value))throw new Error('La copia local no tiene un formato válido.');return value;}
export function ImportLocalData({onImported}:{onImported:()=>Promise<void>}) {
 const [bundle,setBundle]=useState<Bundle|null>(null);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [batchId,setBatchId]=useState('');
 const prepare=async()=>{setBusy(true);setMessage('');try {
  const local=await import('./localDatabase');const data=await local.readDatabase();
  const allQuotes=data.quotes.length?data.quotes:savedArray<PreparedQuote>('servintar.quotes.v1');
  const quotes=migrateQuotes(allQuotes.filter(q=>q.clientId!=='cliente-servintar-demo'));
  const candidates=new Map((data.clients.length?data.clients:savedArray<Client>('servintar.clients.v1')).filter(c=>c.id!=='cliente-servintar-demo').map(c=>[c.id,c]));
  for(const q of quotes)if(!candidates.has(q.clientId)&&q.clientSnapshot)candidates.set(q.clientId,{...q.clientSnapshot,active:false});
  const clients=[...candidates.values()];const invalid=clients.find(c=>validateCuit(c.cuit));
  if(invalid)throw new Error('El CUIT del cliente '+(invalid.alias||invalid.businessName)+' es inválido. La copia local se conserva.');
  const next={clients,quotes,clientTypes:savedArray<string>('servintar.clientTypes.v1'),additionals:savedArray<AdditionalDefinition>('servintar.additionalCatalog.v1')};
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(next)));const hash=Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join('');
  const key='servintar.cloudImport.'+hash;const id=localStorage.getItem(key)||crypto.randomUUID();localStorage.setItem(key,id);
  setBatchId(id);setBundle(next);
 }catch(error){setMessage(error instanceof Error?error.message:'No se pudo leer la copia local.');}finally{setBusy(false);}};
 const upload=async()=>{if(!bundle)return;setBusy(true);setMessage('');try {
  const result=await crmRpc<{clients:number;quotes:number}>('crm_import_local',{p_batch_id:batchId,p_bundle:bundle});
  await onImported();setMessage('Importación verificada: '+result.clients+' clientes y '+result.quotes+' cotizaciones. La copia local se conserva.');setBundle(null);
 }catch(error){setMessage(error instanceof Error?error.message:'No se pudo importar. La copia local se conserva.');}finally{setBusy(false);}};
 const backup=()=>{if(!bundle)return;const url=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='servintar-copia-local.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return <details className="panel"><summary>Importar datos guardados en este navegador</summary><p>Revisá la copia local antes de importarla a Supabase. Los registros de demostración se excluyen y los catálogos existentes en Supabase se conservan.</p>
 <button className="ghost-button" disabled={busy} onClick={()=>void prepare()}>Revisar datos locales</button>
 {bundle&&<><p>{bundle.clients.length} clientes · {bundle.quotes.length} cotizaciones · {bundle.clientTypes.length} tipos · {bundle.additionals.length} adicionales</p><p>{bundle.clients.map(c=>c.alias||c.businessName).join(', ')}</p><p>{bundle.quotes.map(q=>q.number).join(', ')}</p><button className="ghost-button" onClick={backup}>Descargar copia</button><button className="primary-button" disabled={busy} onClick={()=>void upload()}>{busy?'Importando…':'Importar a Supabase'}</button></>}
 {message&&<p role="status">{message}</p>}</details>;
}
