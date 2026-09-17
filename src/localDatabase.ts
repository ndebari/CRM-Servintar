import type { PreparedQuote, Client, ContactInfo } from './crmFeature';
import { migrateQuotes, registerQuote, transitionQuote } from './quoteLifecycle';
const dbPromise = new Promise<IDBDatabase>((resolve,reject) => {
 const request = indexedDB.open('servintar.crm', 1);
 request.onupgradeneeded = () => {
  const db=request.result;
  const quotes=db.createObjectStore('quotes',{keyPath:'id'});
  quotes.createIndex('number','number',{unique:true});
  quotes.createIndex('clientId','clientId');
  db.createObjectStore('clients',{keyPath:'id'});
  db.createObjectStore('meta');
 };
 request.onsuccess=()=>resolve(request.result);
 request.onerror=()=>reject(new Error('No se pudo abrir la base de datos de este navegador.'));
});
function requestValue<T>(request: IDBRequest<T>) { return new Promise<T>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}); }
async function transaction<T>(stores: string[], work:(tx:IDBTransaction)=>Promise<T>, mode: IDBTransactionMode = 'readwrite') {
 const db=await dbPromise; const tx=db.transaction(stores,mode);
 const done=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error || new Error('No se pudo guardar.'));tx.onerror=()=>reject(tx.error);});
 try { const result=await work(tx); await done; return result; }
 catch(error) { try{tx.abort();}catch{} await done.catch(()=>{}); throw error; }
}
export async function initializeDatabase(legacyQuotes: PreparedQuote[], legacyClients: Client[]) {
 return transaction(['quotes','clients','meta'],async tx=>{
  if(await requestValue(tx.objectStore('meta').get('initialized'))) return;
  const quotes=migrateQuotes(legacyQuotes);
  for(const q of quotes) tx.objectStore('quotes').put(q);
  for(const q of quotes) if(q.clientSnapshot) tx.objectStore('clients').put(q.clientSnapshot);
  for(const c of legacyClients) tx.objectStore('clients').put(c);
  tx.objectStore('meta').put(Math.max(0,...quotes.map(q=>q.sequence || 0)),'sequence');
  tx.objectStore('meta').put(true,'initialized');
 });
}
export async function readDatabase() {
 return transaction(['quotes','clients'],async tx=>({quotes:await requestValue<PreparedQuote[]>(tx.objectStore('quotes').getAll()),clients:await requestValue<Client[]>(tx.objectStore('clients').getAll())}),'readonly');
}
export async function storeQuote(input: PreparedQuote, parentId?: string) {
 return transaction(['quotes','clients','meta'],async tx=>{
  const store=tx.objectStore('quotes');
  const existing=await requestValue<PreparedQuote[]>(store.getAll());
  const sequence=(await requestValue<number>(tx.objectStore('meta').get('sequence')) || 0) + 1;
  const result=registerQuote(input,existing,sequence,parentId);
  store.add(result.quote);
  if(result.parent) store.put(result.parent); else tx.objectStore('meta').put(sequence,'sequence');
  if(input.clientSnapshot) tx.objectStore('clients').put(input.clientSnapshot);
  return result.quote;
 });
}
export async function changeQuote(id:string,action:'send'|'approve',contactKey?:string) {
 return transaction(['quotes','clients'],async tx=>{
  const store=tx.objectStore('quotes');const quote=await requestValue<PreparedQuote>(store.get(id));
  if(!quote) throw new Error('Cotización no encontrada.');
  const client=await requestValue<Client>(tx.objectStore('clients').get(quote.clientId)) || quote.clientSnapshot;
  const key=contactKey as 'commercialContact'|'operationalContact'|'purchasingContact';
  const contact: ContactInfo | undefined = ['commercialContact','operationalContact','purchasingContact'].includes(key) ? client?.[key] : undefined;
  const updated=transitionQuote(quote,action,contact);store.put(updated);return updated;
 });
}
export async function storeClients(clients:Client[]) {
 return transaction(['clients'],async tx=>{const store=tx.objectStore('clients');store.clear();for(const client of clients)store.put(client);});
}

export async function storeClient(client:Client) { return transaction(['clients'],async tx=>{tx.objectStore('clients').put(client);}); }
export async function removeClient(id:string) { return transaction(['clients'],async tx=>{tx.objectStore('clients').delete(id);}); }
