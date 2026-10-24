import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretAssistant} from '../app/js/assistant.mjs';
const opts={day:'2026-10-24',month:'2026-10'};
const state={accounts:[{id:'a',name:'Principal',initialCents:100000},{id:'b',name:'Reserva',initialCents:50000}],cards:[],transactions:[
 {type:'expense',amountCents:2000,date:'2026-10-02',category:'Lanches',accountId:'a'},
 {type:'expense',amountCents:3000,date:'2026-10-03',category:'Mercado',accountId:'a'},
 {type:'expense',amountCents:700,date:'2026-09-03',category:'Pets — Ração',accountId:'a'},
 {type:'transfer',amountCents:1000,date:'2026-10-03',accountId:'a',toAccountId:'b'},
 {type:'income',amountCents:10000,date:'2026-10-03',category:'Salário',accountId:'a'}
],preferences:{hideAmounts:false},members:[{id:'me'}]};
const ask=text=>interpretAssistant(text,state,opts);

test('fala prepara valor exato, categoria e data sem gravar nem escolher entre contas',()=>{
 const before=JSON.stringify(state),r=ask('Gastei trinta e cinco reais e cinquenta centavos com ração hoje');
 assert.equal(r.kind,'draft');assert.equal(r.transaction.amountCents,3550);
 assert.equal(r.transaction.description,'ração');assert.equal(r.transaction.category,'Pets — Ração');
 assert.equal(r.transaction.date,'2026-10-24');assert.equal(r.transaction.accountId,'');
 assert.equal(r.transaction.id,undefined);assert.equal(JSON.stringify(state),before);
});
test('aceita moeda brasileira, receita, data relativa e conta explícita',()=>{
 const r=ask('Recebi R$ 1.234,56 de salário ontem na conta Principal');
 assert.equal(r.kind,'draft');assert.equal(r.transaction.amountCents,123456);
 assert.equal(r.transaction.type,'income');assert.equal(r.transaction.date,'2026-10-23');
 assert.equal(r.transaction.accountId,'a');assert.equal(r.transaction.category,'Salário');
});
test('aceita milhares por extenso e categoria personalizada',()=>{
 const r=ask('Gastei dois mil e vinte reais com mudas categoria Jardinagem');
 assert.equal(r.kind,'draft');assert.equal(r.transaction.amountCents,202000);
 assert.equal(r.transaction.category,'Jardinagem');assert.equal(r.transaction.description,'mudas');
 assert.equal(ask('Gastei 15,50 com lanche em 23/10/2026').transaction.date,'2026-10-23');
 assert.equal(ask('Gastei quinze vírgula cinco com lanche').transaction.amountCents,1550);
});
test('não adivinha valor, data, recorrência ou operação ambígua',()=>{
 for(const text of ['Gastei com lanche','Gastei -20 com lanche','Gastei zero reais com lanche','Gastei um dois reais com lanche','Gastei 10 com lanche e 20 com café','Gastei 30 com lanche amanhã de manhã','Gastei 15 com lanche dia 12','Gastei 20 com lanche em 31/02/2026','Gastei 20 com lanche no cartão','Paguei a fatura de 20 reais','Gastei 20 dólares com lanche','Gastei 20 com lanche todo mês','Gastei 20 com lanche na conta Inexistente','Gastei 20 com lanche em 2 vezes']){
  assert.equal(ask(text).kind,'help',text);
 }
});
test('saldo e gastos usam dados reais e ignoram transferências',()=>{
 assert.equal(ask('Qual meu saldo?').valueCents,154300);
 assert.equal(ask('Quanto gastei este mês?').valueCents,5000);
 const r=ask('Quanto gastei com alimentação este mês?');
 assert.equal(r.valueCents,5000);assert.equal(r.month,'2026-10');
 assert.equal(ask('Quanto gastei com ração mês passado?').valueCents,700);
 assert.equal(ask('Quanto gastei com Lanches em 09/2026?').valueCents,0);
});
test('consultas não ignoram filtros ou pedidos fora do escopo',()=>{
 for(const text of ['Quanto gastei com cinema no ano passado?','Quanto gastei na conta Principal?','Qual o saldo da Reserva?','Quanto gastei com alimentação ontem?','Quanto recebi?','Me recomenda ações','Quanto gastei com alimentação em fevereiro?'])assert.equal(ask(text).kind,'help',text);
});
test('projeção e simulação reutilizam os registros e não criam transações',()=>{
 const before=JSON.stringify(state),r=ask('Qual minha projeção?');
 assert.equal(r.kind,'answer');assert.equal(r.valueCents,154300);
 const sim=ask('Se eu gastar 200 reais, como fica meu futuro?');
 assert.equal(sim.kind,'answer');assert.equal(sim.valueCents,134300);
 assert.equal(JSON.stringify(state),before);
});
test('datas relativas e segundo valor por extenso nunca viram lançamento para hoje',()=>{
 const tomorrow=ask('Gastei 20 com almoço amanhã');
 assert.equal(tomorrow.kind,'draft');assert.equal(tomorrow.transaction.date,'2026-10-25');assert.equal(tomorrow.transaction.description,'almoço');
 for(const text of ['Gastei vinte com almoço e trinta com café','Gastei 20 com almoço antes de ontem','Gastei 20 com almoço anteontem','Gastei 20 com almoço daqui a dois dias','Gastei 20 com almoço há três dias','Gastei 20 com almoço na sexta','Gastei 20 com almoço na próxima terça'])assert.equal(ask(text).kind,'help',text);
});
test('multiplicadores, centavos incompletos e valores escondidos em categoria pedem correção',()=>{
 for(const text of ['Gastei 2 mil com aluguel','Gastei dois milhões com casa','Gastei vinte reais e cinquenta com ração','Gastei 20 com almoço categoria Lanches e 30 com café','Gastei 20 com almoço categoria Lanches e trinta com café'])assert.equal(ask(text).kind,'help',text);
 assert.equal(ask('Gastei duzentos reais com ração').transaction.amountCents,20000);
});
