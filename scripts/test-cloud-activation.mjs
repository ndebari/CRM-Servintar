import assert from 'node:assert/strict';import fs from 'node:fs';
const {PGlite}=await import(process.env.CRM_PGLITE_MODULE || '@electric-sql/pglite');const db=new PGlite();
try {
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`);
 await db.exec(fs.readFileSync(new URL('../supabase/crm-complete.sql',import.meta.url),'utf8'));
 const activation=fs.readFileSync(new URL('../supabase/crm-cloud-activation.sql',import.meta.url),'utf8');await db.exec(activation);await db.exec(activation);
 const uid='11111111-1111-4111-8111-111111111111';
 await db.exec(`insert into auth.users(id,email) values ('${uid}','authorized@example.com');insert into public.crm_allowed_emails(email) values ('authorized@example.com');set role authenticated;set request.jwt.claim.sub='${uid}';`);
 const rpc=async(name,args,casts)=>(await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)+'::'+casts[i]).join(',')+') as result',args)).rows[0].result;
 assert.equal(await rpc('crm_claim_access',[],[]),false);
 await db.exec(`reset role;update auth.users set email_confirmed_at=now() where id='${uid}';set role authenticated;`);
 assert.equal(await rpc('crm_claim_access',[],[]),true);
 await assert.rejects(db.query('select * from public.crm_allowed_emails'));
 const client={id:'local-client',cuit:'30707637427',businessName:'SERVINTAR SA',alias:'Local',type:'Importador',commercialContact:{fullName:'Comercial'}};
 const quote={id:'legacy-one',clientId:client.id,sequence:1,number:'C-00001',rootId:'legacy-one',revision:0,state:'Pendiente de envio',createdAt:'2026-09-17T12:00:00Z',quoteDate:'2026-09-17',amount:100,text:'Original',draft:{clientId:client.id,tolls:[],additionals:[]}};
 const bundle={clients:[client],quotes:[quote],clientTypes:[],additionals:[]};const batch='22222222-2222-4222-8222-222222222222';
 assert.equal((await rpc('crm_import_local',[batch,bundle],['uuid','jsonb'])).quotes,1);
 assert.equal((await rpc('crm_import_local',[batch,bundle],['uuid','jsonb'])).quotes,1);
 assert.equal((await rpc('crm_read',[],[])).quotes.length,1);
 const second=await rpc('crm_create_quote',[{...quote,id:'33333333-3333-4333-8333-333333333333'},null],['jsonb','uuid']);assert.equal(second.number,'C-00002');
 const conflict={clients:[{...client,id:'new-client',cuit:'30500014047'}],quotes:[{...quote,id:'conflict',rootId:'conflict',clientId:'new-client'}]};
 await assert.rejects(rpc('crm_import_local',['44444444-4444-4444-8444-444444444444',conflict],['uuid','jsonb']),/ya existe/);
 assert.equal((await rpc('crm_read',[],[])).clients.length,1);
 await assert.rejects(rpc('crm_import_local',[batch,{...bundle,clients:[]}],['uuid','jsonb']),/cambió/);
 await db.exec('reset role;set role anon');await assert.rejects(rpc('crm_claim_access',[],[]));await assert.rejects(rpc('crm_import_local',[batch,bundle],['uuid','jsonb']));
 console.log('PASS: acceso sólo con correo confirmado/autorizado; importación atómica, reintentos, IDs antiguos, contador global y conflictos sin pérdida.');
}finally{await db.close();}
