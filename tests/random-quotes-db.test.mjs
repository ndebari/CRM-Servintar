import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Set PGLITE_MODULE_PATH to an installed @electric-sql/pglite/dist/index.js.
test('random quotes persist, retry idempotently and enforce membership and ownership', {skip:!process.env.PGLITE_MODULE_PATH}, async () => {
 const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href);
 const db = new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create table auth.users(id uuid primary key);
   insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
   create function auth.uid() returns uuid language sql as $$select current_setting('test.uid')::uuid$$;
   create function public.crm_require_member() returns void language plpgsql as $$begin if current_setting('test.member')<>'yes' then raise exception 'Acceso no autorizado'; end if; end$$;
   create function public.crm_is_admin() returns boolean language sql as $$select current_setting('test.admin')='yes'$$;
   set test.uid='00000000-0000-0000-0000-000000000001'; set test.member='yes'; set test.admin='no';`);
  const migration=await readFile(new URL('../supabase/crm-random-quotes.sql',import.meta.url),'utf8');
  await db.exec(migration);await db.exec(migration);
  const quote={id:'10000000-0000-0000-0000-000000000001',random:true,clientId:'',amount:18800,summary:'Consulta de transporte',text:'Tarifa final',draft:{random:true,clientId:'',distanceKm:100,requiredDays:1,utilityPercent:20,tollListStatus:'manual',tollRouteKey:'route',tolls:[],roundingUnit:100}};
  const save=async q=>(await db.query('select public.crm_create_random_quote($1::jsonb) as data',[JSON.stringify(q)])).rows[0].data;
  const read=async ()=>(await db.query('select public.crm_read_random_quotes() as data')).rows[0].data;
  const first=await save(quote);assert.equal(first.number,'CR-00001');assert.equal(first.amount,18800);
  assert.deepEqual(await save(quote),first);assert.equal((await read()).length,1);
  const next={...quote,id:'10000000-0000-0000-0000-000000000002'};
  await assert.rejects(save({...next,draft:{...next.draft,tollListStatus:'pending'}}),/Completá/);
  await assert.rejects(save({...next,amount:null}),/Completá/);
  await assert.rejects(save({...next,draft:{...next.draft,tolls:[{amount:null}]}}),/peajes/);
  await db.exec("set test.uid='00000000-0000-0000-0000-000000000002'");
  assert.deepEqual(await read(),[]);await assert.rejects(save(quote),/autorizada/);
  await db.exec("set test.admin='yes'");assert.equal((await read()).length,1);
  await db.exec("set test.member='no'");await assert.rejects(save(next),/autorizado/);await assert.rejects(read(),/autorizado/);
 } finally { await db.close(); }
});
