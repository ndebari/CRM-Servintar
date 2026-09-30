import { useRef, useState } from 'react';
import type { Client } from './crmFeature';
import { crmRpc } from './quoteDatabase';

export function HistoricalTariffForm({clients,initialClientId,onSaved,onCancel}:{clients:Client[];initialClientId:string;onSaved:()=>Promise<void>;onCancel:()=>void}) {
 const [clientId,setClientId]=useState(initialClientId);
 const [kind,setKind]=useState<'impo'|'expo'>('impo');
 const [roundtrip,setRoundtrip]=useState(false);
 const [pickup,setPickup]=useState('');const [destination,setDestination]=useState('');const [delivery,setDelivery]=useState('');
 const [amount,setAmount]=useState('');const [month,setMonth]=useState('');
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const pending=useRef<{key:string;id:string}>();
 const pickupLabel=kind==='impo'?'Retiro de cargado':'Retiro de vacío';
 const deliveryLabel=kind==='impo'?'Devolución de vacío':'Entrega de cargado';
 const save=async(event:React.FormEvent)=>{
  event.preventDefault();if(busy)return;setError('');
  const client=clients.find(c=>c.id===clientId);const value=Number(amount);
  if(!client || !pickup.trim() || !destination.trim() || !delivery.trim() || !Number.isFinite(value) || value<=0 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month.startsWith('0000')){setError('Completá el cliente, recorrido, tarifa aprobada y mes/año de vigencia.');return;}
  const draft={clientId,transportKind:kind,isRoundTrip:roundtrip,pickup:pickup.trim(),destination:destination.trim(),delivery:delivery.trim(),effectiveMonth:month};
  const key=JSON.stringify({draft,value});if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};
  setBusy(true);
  try {
   await crmRpc('crm_save_historical_tariff',{p_quote:{id:pending.current.id,clientId,clientName:client.alias || client.businessName,historical:true,effectiveOn:month+'-01',amount:value,draft,
    summary:`${kind.toUpperCase()} · ${roundtrip?'Roundtrip':'Sin roundtrip'} · ${draft.pickup} → ${draft.destination} → ${draft.delivery}`,
    text:[`Tarifa histórica · ${client.alias || client.businessName}`,`Operación: ${kind.toUpperCase()} · ${roundtrip?'Roundtrip':'Sin roundtrip'}`,`${pickupLabel}: ${draft.pickup}`,`Destino: ${draft.destination}`,`${deliveryLabel}: ${draft.delivery}`,`Tarifa aprobada: ${value.toLocaleString('es-AR',{style:'currency',currency:'ARS'})}`,`Vigencia: ${month.slice(5)}/${month.slice(0,4)}`].join('\n') }});
   await onSaved();
  }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar la tarifa.');}finally{setBusy(false);}
 };
 return <form className="panel" onSubmit={save} aria-label="Carga de tarifa histórica">
  <h2>Cargar tarifa histórica</h2>
  <fieldset disabled={busy} style={{border:0,padding:0,margin:0}}><div className="form-grid">
   <label>Cliente<select required value={clientId} onChange={e=>setClientId(e.target.value)}><option value="">Seleccionar cliente</option>{clients.map(c=><option key={c.id} value={c.id}>{c.alias || c.businessName}</option>)}</select></label>
   <label>Operación<select value={kind} onChange={e=>{setKind(e.target.value as 'impo'|'expo');setPickup('');setDelivery('');}}><option value="impo">Impo</option><option value="expo">Expo</option></select></label>
   <label>Roundtrip<select value={roundtrip?'yes':'no'} onChange={e=>setRoundtrip(e.target.value==='yes')}><option value="no">No</option><option value="yes">Sí</option></select></label>
   <label>{pickupLabel}<input required value={pickup} onChange={e=>setPickup(e.target.value)}/></label>
   <label>Destino<input required value={destination} onChange={e=>setDestination(e.target.value)}/></label>
   <label>{deliveryLabel}<input required value={delivery} onChange={e=>setDelivery(e.target.value)}/></label>
   <label>Tarifa aprobada (ARS)<input required type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
   <label>Vigencia (mes/año)<input required type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>
  </div>
  {error && <p role="alert">{error}</p>}
  <div className="quote-family"><button className="primary-button" type="submit">{busy?'Guardando…':'Guardar tarifa histórica'}</button><button className="ghost-button" type="button" onClick={onCancel}>Cancelar</button></div>
  </fieldset>
 </form>;
}
