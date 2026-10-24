import test from 'node:test';
import assert from 'node:assert/strict';
import {projectBalance,transactionImpact} from '../app/js/projection.mjs';

const state=transactions=>({accounts:[{id:'a',initialCents:100000}],cards:[],transactions,contributions:[],goals:[]});
const tx=(type,date,amountCents,extra={})=>({id:date+type,type,date,amountCents,accountId:'a',...extra});
const cardState=payments=>({...state([
 tx('cardPurchase','2026-10-24',60000,{cardId:'c'}),...payments
]),cards:[{id:'c',closingDay:20,dueDay:10}]});

test('lançamentos únicos alteram o futuro uma única vez, no mês previsto',()=>{
 const s=state([tx('expense','2026-10-24',1500),tx('income','2026-11-01',200000)]);
 const before=JSON.stringify(s),p=projectBalance(s,'2026-10',12);
 assert.equal(p.openingCents,100000);
 assert.deepEqual(p.months.slice(0,2).map(m=>m.balanceCents),[98500,298500]);
 assert.equal(p.months.at(-1).balanceCents,298500);
 assert.equal(p.netCents,198500);
 assert.equal(p.months.at(-1).month,'2027-09');
 assert.equal(JSON.stringify(s),before);
});
test('histórico compõe a base; transferências e aportes não viram gastos',()=>{
 const s=state([tx('income','2026-09-01',500),tx('transfer','2026-10-01',90000,{toAccountId:'b'}),tx('expense','2026-11-01',10000)]);
 s.accounts.push({id:'b',initialCents:0});s.contributions.push({amountCents:5000,date:'2026-10-01'});
 const p=projectBalance(s,'2026-10',3);
 assert.equal(p.openingCents,100500);
 assert.deepEqual(p.months.map(m=>m.balanceCents),[100500,90500,90500]);
});
test('cartão considera fechamento e vencimento sem duplicar pagamento parcial',()=>{
 const s=cardState([tx('cardPayment','2026-12-05',20000,{cardId:'c',invoiceMonth:'2026-11'})]);
 const p=projectBalance(s,'2026-10',3);
 assert.deepEqual(p.months.map(m=>m.balanceCents),[100000,100000,40000]);
 assert.equal(p.expenseCents,60000);
});
test('pagamento anterior já está na base e só o restante entra no futuro',()=>{
 const s=cardState([tx('cardPayment','2026-10-30',20000,{cardId:'c',invoiceMonth:'2026-11'})]);
 const p=projectBalance(s,'2026-11',3);
 assert.equal(p.openingCents,80000);
 assert.deepEqual(p.months.map(m=>m.balanceCents),[80000,40000,40000]);
});
test('fatura vencida fica no primeiro mês e pagamento tardio não duplica a saída',()=>{
 const s=cardState([tx('cardPayment','2027-01-20',60000,{cardId:'c',invoiceMonth:'2026-11'})]);
 assert.deepEqual(projectBalance(s,'2026-11',3).months.map(m=>m.balanceCents),[100000,40000,40000]);
 const overdue=cardState([]);overdue.transactions[0].date='2026-09-10';
 assert.equal(projectBalance(overdue,'2026-11',3).months[0].balanceCents,40000);
});
test('saldo negativo, horizonte vazio e correção de valor são refletidos',()=>{
 assert.equal(projectBalance(state([]),'2026-10',3).netCents,0);
 const s=state([tx('expense','2026-10-24',120000)]);
 assert.equal(projectBalance(s,'2026-10',3).months.at(-1).balanceCents,-20000);
 s.transactions[0].amountCents=20000;
 assert.equal(projectBalance(s,'2026-10',3).months.at(-1).balanceCents,80000);
});
test('impacto individual distingue entradas, saídas e movimentos neutros',()=>{
 for(const [type,want] of [['income',1500],['expense',-1500],['cardPurchase',-1500],['transfer',0],['cardPayment',0]])assert.equal(transactionImpact({type,amountCents:1500}),want);
});
