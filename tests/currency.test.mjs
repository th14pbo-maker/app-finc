import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBrlCents,formatBrlCents,formatBrlDraft} from '../app/js/currency.mjs';

test('converte reais brasileiros em centavos sem perder precisão',()=>{
  for(const [input,cents] of [['10000',1000000],['10.000',1000000],['10.000,00',1000000],['R$ 1.234,56',123456],['0,29',29],[',50',50],['12,3',1230],['1,',100],['00015,05',1505]]) assert.equal(parseBrlCents(input),cents,input);
});
test('rejeita valores vazios, ambíguos ou inválidos em vez de mudar o valor',()=>{
  for(const input of ['', ' ', '-', '.',  '1,234', '1,2,3', '12abc', '1e3', 'Infinity', '10.000.000.000,01']) assert.throws(()=>parseBrlCents(input),undefined,input);
});
test('preserva saldo negativo e zero somente nos campos que os permitem',()=>{
  assert.throws(()=>parseBrlCents('-1,00'));
  assert.throws(()=>parseBrlCents('0,00'));
  assert.equal(parseBrlCents('-1.234,56',{minCents:-1e12}),-123456);
  assert.equal(parseBrlCents('0',{minCents:0}),0);
  assert.equal(parseBrlCents('10.000.000.000,00'),1000000000000);
});
test('exibe milhar e duas casas decimais, inclusive ao editar valores existentes',()=>{
  for(const [cents,text] of [[1000000,'10.000,00'],[123456,'1.234,56'],[29,'0,29'],[0,'0,00'],[-105,'-1,05'],[1000000000000,'10.000.000.000,00']]) assert.equal(formatBrlCents(cents),text);
});
test('formata durante a digitação preservando a vírgula e entradas incompletas',()=>{
  for(const [input,text] of [['10000','10.000'],['1234,','1.234,'],['1234,5','1.234,5'],['R$ 1.234,56','1.234,56'],['',''],['-','-'],[',','0,'],['000','0'],['1.23','1,23'],['1,234','1,234']]) assert.equal(formatBrlDraft(input),text);
});

test('corrige separadores comuns automaticamente',()=>{for(const value of ['15.00','15;00','15:00','R$ 15,00','15 , 00']){assert.equal(parseBrlCents(value),1500);assert.equal(formatBrlDraft(value),'15,00');}assert.equal(parseBrlCents('1.234'),123400);assert.equal(parseBrlCents('1,234.56'),123456);});
