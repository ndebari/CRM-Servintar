import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const temp=await mkdtemp(fileURLToPath(new URL('./.lifecycle-test-',import.meta.url)));
after(()=>rm(temp,{recursive:true,force:true}));
const source=await readFile(new URL('../src/quoteLifecycle.ts',import.meta.url),'utf8');
await writeFile(temp+'/lifecycle.mjs',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const {quoteNumber,registerQuote,transitionQuote,migrateQuotes}=await import(pathToFileURL(temp+'/lifecycle.mjs').href);
const input={id:'a',clientId:'client',quoteDate:'2026-09-17',requestDate:'2026-09-17',text:'Tarifa original',amount:100,state:'Aprobada'};
const contact={fullName:'Contacto elegido',email:'contacto@example.com',role:'Compras',phone:''};
test('original numbers are five digits and always begin pending',()=>{
 const {quote}=registerQuote(input,[],1);
 assert.equal(quote.number,'C-00001');assert.equal(quote.state,'Pendiente de envio');assert.equal(quote.sequence,1);
 assert.throws(()=>quoteNumber(100000));assert.throws(()=>quoteNumber(0));
});
test('sending requires contact and approval requires a registered send',()=>{
 const {quote}=registerQuote(input,[],1);
 assert.throws(()=>transitionQuote(quote,'send'));
 assert.throws(()=>transitionQuote(quote,'approve'));
 const sent=transitionQuote(quote,'send',contact,'2026-09-17T15:00:00Z');
 contact.fullName='changed';assert.equal(sent.sentTo.fullName,'Contacto elegido');
 assert.equal(sent.state,'Enviada / pendiente');
 const approved=transitionQuote(sent,'approve',undefined,'2026-09-18T12:00:00Z');
 assert.equal(approved.state,'Aprobada');assert.equal(approved.approvedAt,'2026-09-18T12:00:00Z');
 assert.throws(()=>transitionQuote(approved,'send',contact));
});
test('revisions keep root, client, original prices and start a fresh workflow',()=>{
 const original=transitionQuote(registerQuote(input,[],1).quote,'send',contact);
 const first=registerQuote({...input,id:'b',amount:150},[original],2,'a','2026-09-18T12:00:00Z');
 assert.equal(first.quote.number,'C-00001-R-01');assert.equal(first.quote.parentId,'a');
 assert.equal(first.parent.amount,100);assert.equal(first.parent.state,'Recotizada');
 assert.equal(first.quote.state,'Pendiente de envio');assert.equal(first.quote.sentTo,undefined);
 const sent=transitionQuote(first.quote,'send',contact);
 const next=registerQuote({...input,id:'c'},[first.parent,sent],2,'b');
 assert.equal(next.quote.number,'C-00001-R-02');assert.equal(next.quote.rootId,'a');
 assert.throws(()=>registerQuote({...input,id:'d',clientId:'other'},[original],2,'a'));
 assert.throws(()=>registerQuote({...input,id:'d'},[first.parent],2,'a'));
});
test('legacy migration numbers chronologically and is idempotent',()=>{
 const old=[{...input,id:'new',quoteDate:'2026-09-17'},{...input,id:'old',quoteDate:'2026-09-01'}];
 const migrated=migrateQuotes(old);
 assert.equal(migrated[0].id,'old');assert.equal(migrated[0].number,'C-00001');
 assert.deepEqual(migrateQuotes(migrated),migrated);
});
