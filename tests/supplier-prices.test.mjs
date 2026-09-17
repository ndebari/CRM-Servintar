import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import ts from 'typescript';
const source=await readFile(new URL('../src/supplierPrices.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {listAtMonth}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const a={id:'a',supplierId:'fletero',establishedOn:'2025-01-10',createdAt:'2025-01-10T10:00:00Z'};
const b={...a,id:'b',establishedOn:'2025-03-01',createdAt:'2025-03-01T10:00:00Z'};
test('consulta mensual conserva vigencia, separa proveedor y no anticipa precios futuros',()=>{
 const other={...b,id:'other',supplierId:'other'};
 assert.equal(listAtMonth([b,other,a],'fletero','2025-02','2025-03-10').id,'a');
 assert.equal(listAtMonth([b,other,a],'fletero','2025-03','2025-03-10').id,'b');
 assert.equal(listAtMonth([b,a],'fletero','2024-12','2025-03-10'),undefined);
 assert.equal(listAtMonth([b,a],'fletero','2025-03','2025-02-28').id,'a');
});
test('actualizaciones del mismo día eligen la última sin modificar las versiones anteriores',()=>{
 const revision={...b,id:'c',createdAt:'2025-03-01T15:00:00Z'};const entries=[b,a,revision];
 assert.equal(listAtMonth(entries,'fletero','2025-03','2025-03-10').id,'c');assert.deepEqual(entries,[b,a,revision]);
});
