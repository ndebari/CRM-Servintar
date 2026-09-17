import {test,after} from 'node:test';import assert from 'node:assert/strict';import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';import {fileURLToPath,pathToFileURL} from 'node:url';import ts from 'typescript';
const temp=await mkdtemp(fileURLToPath(new URL('./.cloud-test-',import.meta.url)));after(()=>rm(temp,{recursive:true,force:true}));
await writeFile(temp+'/supabase.mjs',`export const calls=[];export let reply={data:null,error:null};export function respond(value){reply=value}export const supabase={rpc:async(name,args)=>{calls.push({name,args});return reply}};`);
const source=await readFile(new URL('../src/quoteDatabase.ts',import.meta.url),'utf8');await writeFile(temp+'/repository.mjs',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("'./supabase'","'./supabase.mjs'"));
const api=await import(pathToFileURL(temp+'/repository.mjs').href);const mock=await import(pathToFileURL(temp+'/supabase.mjs').href);
test('cloud saves go to RPC with stable UUID and parent, errors never save locally',async()=>{
 mock.respond({data:{id:'fixed',number:'C-00001'},error:null});await api.storeQuote({id:'fixed'},'parent');assert.deepEqual(mock.calls.at(-1),{name:'crm_create_quote',args:{p_quote:{id:'fixed'},p_parent_id:'parent'}});
 mock.respond({data:null,error:{message:'offline'}});await assert.rejects(api.storeQuote({id:'fixed'}),/offline/);
});
test('catalog normalizes nullable defaults and submits expected prior version',async()=>{
 mock.respond({data:null,error:null});const item={id:'x',name:'Demora',kind:'fixed',description:''};await api.saveRemoteAdditionals([{...item,amount:100}],[item]);
 assert.equal(mock.calls.at(-1).args.p_expected[0].amount,null);assert.equal(mock.calls.at(-1).args.p_items[0].amount,100);
 mock.respond({data:{schemaVersion:1,clients:[],quotes:[],clientTypes:[],additionals:[{...item,amount:null}]},error:null});assert.equal((await api.readDatabase()).additionals[0].amount,undefined);
});
test('state transition supplies exact company contact selection',async()=>{
 mock.respond({data:{},error:null});await api.changeQuote('q','send','purchasingContact');assert.deepEqual(mock.calls.at(-1),{name:'crm_transition_quote',args:{p_id:'q',p_action:'send',p_contact_key:'purchasingContact'}});
});
