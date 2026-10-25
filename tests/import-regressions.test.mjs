import test from 'node:test';
import assert from 'node:assert/strict';
import {validateImportPayload} from '../app/js/import-payload.mjs';
const base = () => ({members:[],accounts:[{id:'a',name:'Conta',initialCents:0,color:'#112233'}],cards:[],goals:[],contributions:[],transactions:[{id:'t',type:'income',description:'Receita',date:'2026-10-25',amountCents:100,accountId:'a',category:'Outros'}],preferences:{displayName:'Você',theme:'dark'}});
test('rejeita datas de calendário impossíveis antes do envio',()=>{
 for(const date of ['2026-02-30','2025-02-29','2026-04-31']){const p=base();p.transactions[0].date=date;assert.throws(()=>validateImportPayload(p),/Data inválida/);}
 const p=base();p.transactions[0].date='2024-02-29';assert.equal(validateImportPayload(p),true);
});
test('aceita notes null de exportação compatível com SQL',()=>{const p=base();p.transactions[0].notes=null;assert.equal(validateImportPayload(p),true);});
test('preserva entrada original ao validar backup legado',()=>{const p=base(),copy=structuredClone(p);assert.equal(validateImportPayload(p),true);assert.deepEqual(p,copy);});
