import { useEffect, useState } from 'react';
import { ClientsModule, type Client } from './crmFeature';
import { crmRpc } from './quoteDatabase';
import { SessionControls } from './SessionControls';
import { argentinaToday,listAtMonth,type FreightList,type FreightLine } from './supplierPrices';
type Supplier=Client&{deletedAt?:string|null};
type SupplierData={suppliers:Supplier[];prices:FreightList[]};
type EditLine=Omit<FreightLine,'amount'>&{amount:string};
type EditList={id:string;establishedOn:string;currency:'ARS'|'USD';notes:string;lines:EditLine[];expectedId:string|null};
const newLine=():EditLine=>({id:crypto.randomUUID(),origin:'',destination:'',service:'',unit:'Viaje',amount:''});
const displayDate=(value:string)=>value.split('-').reverse().join('/');
const emptyContact={fullName:'',role:'',email:'',phone:''};
export function SuppliersModule({prices=false}:{prices?:boolean}){
 const [data,setData]=useState<SupplierData>({suppliers:[],prices:[]});
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [supplierId,setSupplierId]=useState('');
 const [month,setMonth]=useState(argentinaToday().slice(0,7));
 const [version,setVersion]=useState('');
 const [draft,setDraft]=useState<EditList|null>(null);
 const [saving,setSaving]=useState(false);
 const load=async()=>{
  const result=await crmRpc<SupplierData>('crm_read_suppliers');
  setData({...result,suppliers:result.suppliers.map(s=>({...s,purchasingContact:{...emptyContact},commercialContact:s.commercialContact||{...emptyContact},operationalContact:s.operationalContact||{...emptyContact}}))});setLoading(false);
 };
 useEffect(()=>{void load().catch(e=>{setError(e.message);setLoading(false);});},[]);
 const saveSupplier=async(supplier:Client)=>{await crmRpc('crm_save_supplier',{p_supplier:supplier});await load();};
 const deleteSupplier=async(id:string)=>{await crmRpc('crm_delete_supplier',{p_id:id});await load();};
 const supplier=data.suppliers.find(s=>s.id===supplierId);
 const latest=listAtMonth(data.prices,supplierId,argentinaToday().slice(0,7));
 const atMonth=listAtMonth(data.prices,supplierId,month);
 const monthVersions=data.prices.filter(p=>p.supplierId===supplierId&&p.establishedOn.startsWith(month));
 const displayed=(version?monthVersions.find(p=>p.id===version):undefined)||atMonth;
 const discard=()=>!draft||window.confirm('¿Descartar los cambios de esta lista que todavía no guardaste?');
 const startEdit=()=>{
  setError('');setNotice('');setMonth(argentinaToday().slice(0,7));setVersion('');
  setDraft({id:crypto.randomUUID(),establishedOn:argentinaToday(),currency:latest?.currency||'ARS',notes:latest?.notes||'',expectedId:latest?.id||null,lines:latest?latest.lines.map(l=>({...l,amount:String(l.amount)})):[newLine()]});
 };
 const patchLine=(id:string,key:keyof EditLine,value:string)=>setDraft(d=>d?{...d,lines:d.lines.map(l=>l.id===id?{...l,[key]:value}:l)}:d);
 const save=async()=>{
  if(!draft)return;setError('');setNotice('');
  if(!draft.lines.length||draft.lines.some(l=>!l.service.trim()||!l.unit.trim()||l.amount.trim()===''||!Number.isFinite(Number(l.amount))||Number(l.amount)<0)){setError('Completá servicio, unidad e importe de cada tarifa.');return;}
  const payload={id:draft.id,supplierId,establishedOn:draft.establishedOn,currency:draft.currency,notes:draft.notes,lines:draft.lines.map(l=>({...l,service:l.service.trim(),unit:l.unit.trim(),amount:Number(l.amount)}))};
  setSaving(true);
  try{
   await crmRpc('crm_save_supplier_prices',{p_list:payload,p_expected_id:draft.expectedId});
   setDraft(null);setVersion('');setMonth(argentinaToday().slice(0,7));setNotice('Lista guardada. Las versiones anteriores se conservaron.');
   await load();
  }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar la lista.');}finally{setSaving(false);}
 };
 if(loading)return <p>Cargando proveedores…</p>;
 return <>
 {error&&<p role="alert">{error} <button type="button" className="ghost-button" disabled={saving} onClick={()=>{if(discard()){setDraft(null);setError('');void load().catch(e=>setError(e.message));}}}>Recargar</button></p>}
 {!prices?<ClientsModule supplierMode clients={data.suppliers.filter(s=>!s.deletedAt)} clientTypes={['Fletero','Otro proveedor']} onSaveClient={saveSupplier} onDeleteClient={deleteSupplier}/>:<>
 <header className="topbar"><div><h1>Precios fleteros</h1></div><SessionControls/></header>
 <section className="panel"><div className="form-grid">
 <label>Fletero<select value={supplierId} disabled={saving} onChange={e=>{if(discard()){setSupplierId(e.target.value);setDraft(null);setVersion('');setNotice('');setError('');}}}><option value="">Seleccionar nombre de fantasía</option>{data.suppliers.filter(s=>s.type==='Fletero'||data.prices.some(p=>p.supplierId===s.id)).map(s=><option key={s.id} value={s.id}>{s.alias}{s.deletedAt?' (dado de baja)':s.active===false?' (inactivo)':''}</option>)}</select></label>
 <label>Consultar mes<input type="month" value={month} min="2000-01" max={argentinaToday().slice(0,7)} disabled={saving} onChange={e=>{if(e.target.value&&discard()){setMonth(e.target.value);setDraft(null);setVersion('');setNotice('');}}}/></label>
 </div>
 {supplier&&<><p>{supplier.businessName}</p>{!supplier.deletedAt&&supplier.active!==false&&!draft&&<button className="primary-button" onClick={startEdit}>{latest?'Actualizar precios vigentes':'Crear lista de precios'}</button>}</>}
 {!data.suppliers.some(s=>s.type==='Fletero')&&<p>Creá un proveedor de tipo Fletero para cargar sus precios.</p>}
 </section>
 {notice&&<p role="status">{notice}</p>}
 {supplier&&draft?<section className="panel"><h2>{latest?'Actualizar lista':'Nueva lista'}</h2><p>Al guardar se crea una nueva versión y se conserva el historial.</p>
 <form onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={saving} className="freight-editor"><div className="form-grid">
 <label>Vigente desde<input type="date" required min={latest?.establishedOn||'2000-01-01'} max={argentinaToday()} value={draft.establishedOn} onChange={e=>setDraft({...draft,establishedOn:e.target.value})}/></label>
 <label>Moneda<select value={draft.currency} onChange={e=>setDraft({...draft,currency:e.target.value as 'ARS'|'USD'})}><option value="ARS">Pesos argentinos</option><option value="USD">Dólares estadounidenses</option></select></label></div>
 <div className="freight-table-scroll"><table className="freight-table"><thead><tr><th>Origen</th><th>Destino</th><th>Servicio / descripción</th><th>Unidad</th><th>Tarifa</th><th></th></tr></thead><tbody>{draft.lines.map((line,i)=><tr key={line.id}>
 {(['origin','destination','service','unit'] as const).map((key,j)=><td key={key}><input aria-label={`${['Origen','Destino','Servicio','Unidad'][j]} ${i+1}`} required={key==='service'||key==='unit'} value={line[key]} onChange={e=>patchLine(line.id,key,e.target.value)}/></td>)}
 <td><input aria-label={`Tarifa ${i+1}`} type="number" min="0" max="999999999999" step="0.01" required value={line.amount} onChange={e=>patchLine(line.id,'amount',e.target.value)}/></td>
 <td><button type="button" className="ghost-button" aria-label={`Eliminar tarifa ${i+1}`} onClick={()=>setDraft({...draft,lines:draft.lines.filter(l=>l.id!==line.id)})}>Eliminar</button></td></tr>)}</tbody></table></div>
 <button type="button" className="ghost-button" onClick={()=>setDraft({...draft,lines:[...draft.lines,newLine()]})}>Agregar tarifa</button>
 <label>Observaciones<textarea value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label>
 <div className="freight-actions"><button className="primary-button" disabled={saving}>{saving?'Guardando…':'Guardar lista'}</button><button type="button" className="ghost-button" onClick={()=>{if(discard())setDraft(null);}}>Cancelar</button></div>
 </fieldset></form></section>:supplier&&<section className="panel">
 {monthVersions.length>1&&<label>Versiones del mes<select value={displayed?.id||''} onChange={e=>setVersion(e.target.value)}>{monthVersions.map((p,i)=><option key={p.id} value={p.id}>{displayDate(p.establishedOn)} · {new Date(p.createdAt).toLocaleString('es-AR')} · versión {monthVersions.length-i}</option>)}</select></label>}
 {displayed?<><h2>{month===argentinaToday().slice(0,7)&&displayed.id===latest?.id?'Precios vigentes':'Lista histórica'}</h2><p>Vigente desde: <strong>{displayDate(displayed.establishedOn)}</strong> · Moneda: {displayed.currency}</p><p>Registrada el {new Date(displayed.createdAt).toLocaleString('es-AR')}</p>
 {!displayed.establishedOn.startsWith(month)&&<p>En este mes continuaba vigente la lista establecida el {displayDate(displayed.establishedOn)}.</p>}
 <div className="freight-table-scroll"><table className="freight-table"><thead><tr><th>Origen</th><th>Destino</th><th>Servicio</th><th>Unidad</th><th>Tarifa</th></tr></thead><tbody>{displayed.lines.map((line,i)=><tr key={line.id||i}><td>{line.origin||'—'}</td><td>{line.destination||'—'}</td><td>{line.service}</td><td>{line.unit}</td><td>{new Intl.NumberFormat('es-AR',{style:'currency',currency:displayed.currency}).format(line.amount)}</td></tr>)}</tbody></table></div>{displayed.notes&&<p className="freight-notes">{displayed.notes}</p>}</>:<p>No hay una lista vigente para este proveedor en el mes seleccionado.</p>}
 </section>}
 </>}
 </>;
}
