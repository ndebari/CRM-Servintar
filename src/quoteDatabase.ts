import { supabase } from './supabase';
import type { PreparedQuote, Client, AdditionalDefinition } from './crmFeature';
export async function crmRpc<T>(name:string,args:Record<string,unknown>={}) {
 if(!supabase) throw new Error('Supabase no está configurado.');
 const {data,error}=await supabase.rpc(name,args);
 if(error) throw new Error(error.message || 'No se pudo guardar en Supabase.');
 return data as T;
}
export type CrmData={clients:Client[];quotes:PreparedQuote[];clientTypes:string[];additionals:AdditionalDefinition[];schemaVersion:number};
export async function readDatabase() {
 const data=await crmRpc<CrmData>('crm_read');
 if(data.schemaVersion!==1 || !Array.isArray(data.clients) || !Array.isArray(data.quotes)) throw new Error('La estructura de Supabase no es compatible.');
 return {...data,additionals:data.additionals.map(item=>({...item,amount:item.amount ?? undefined}))};
}
export const storeClient=(client:Client)=>crmRpc<Client>('crm_save_client',{p_client:client});
export const removeClient=(id:string)=>crmRpc<void>('crm_delete_client',{p_id:id});
export const storeQuote=(quote:PreparedQuote,parentId?:string)=>crmRpc<PreparedQuote>('crm_create_quote',{p_quote:quote,p_parent_id:parentId || null});
export const changeQuote=(id:string,action:'send'|'approve',contactKey?:string)=>crmRpc<PreparedQuote>('crm_transition_quote',{p_id:id,p_action:action,p_contact_key:contactKey || null});
const normalizeAdditionals=(items:AdditionalDefinition[])=>items.map(i=>({id:i.id,name:i.name,description:i.description,kind:i.kind,amount:i.amount ?? null}));
export const saveRemoteTypes=(items:string[],expected:string[],rename?:{from:string;to:string})=>crmRpc<void>('crm_save_catalog',{p_kind:'types',p_items:items,p_expected:expected,p_rename:rename || null});
export const saveRemoteAdditionals=(items:AdditionalDefinition[],expected:AdditionalDefinition[])=>crmRpc<void>('crm_save_catalog',{p_kind:'additionals',p_items:normalizeAdditionals(items),p_expected:normalizeAdditionals(expected),p_rename:null});
