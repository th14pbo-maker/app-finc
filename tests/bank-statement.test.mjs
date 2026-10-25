import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseOfx,
  parseCsv,
  parseStatementText,
  categorizeTransaction,
  analyzeStatement
} from '../app/js/bank-statement.mjs';

test('OFX: extrai lançamentos de extrato bancário padrão com datas, valores e tipos corretos', () => {
  const sampleOfx = `
OFXHEADER:100
DATA:OFXSGML
VERSION:102
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261024120000[-03:EST]
<TRNAMT>-154.20
<FITID>20261024001
<MEMO>SUPERMERCADO CARREFOUR
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261023120000
<TRNAMT>4500.00
<FITID>20261023001
<MEMO>SALARIO MENSAL EMPRESA
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261022120000
<TRNAMT>-85.50
<FITID>20261022001
<MEMO>POSTO SHELL COMBUSTIVEL
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

  const items = parseOfx(sampleOfx);
  assert.equal(items.length, 3);

  // Item 1: Supermercado
  assert.equal(items[0].date, '2026-10-24');
  assert.equal(items[0].description, 'SUPERMERCADO CARREFOUR');
  assert.equal(items[0].amountCents, 15420);
  assert.equal(items[0].type, 'expense');
  assert.equal(items[0].category, 'Mercado');

  // Item 2: Salário
  assert.equal(items[1].date, '2026-10-23');
  assert.equal(items[1].description, 'SALARIO MENSAL EMPRESA');
  assert.equal(items[1].amountCents, 450000);
  assert.equal(items[1].type, 'income');
  assert.equal(items[1].category, 'Salário');

  // Item 3: Posto
  assert.equal(items[2].date, '2026-10-22');
  assert.equal(items[2].amountCents, 8550);
  assert.equal(items[2].type, 'expense');
  assert.equal(items[2].category, 'Combustível');
});

test('CSV: processa extrato com delimitador ponto e vírgula e formato brasileiro', () => {
  const sampleCsv = `Data;Descrição;Valor
24/10/2026;DROGARIA SAO PAULO;-45,90
23/10/2026;PIX RECEBIDO JOAO;+350,00
22/10/2026;ENEL ENERGIA;120,40 D
`;

  const items = parseCsv(sampleCsv);
  assert.equal(items.length, 3);

  assert.equal(items[0].date, '2026-10-24');
  assert.equal(items[0].description, 'DROGARIA SAO PAULO');
  assert.equal(items[0].amountCents, 4590);
  assert.equal(items[0].type, 'expense');
  assert.equal(items[0].category, 'Medicamentos');

  assert.equal(items[1].date, '2026-10-23');
  assert.equal(items[1].amountCents, 35000);
  assert.equal(items[1].type, 'income');
  assert.equal(items[1].category, 'Renda extra');

  assert.equal(items[2].date, '2026-10-22');
  assert.equal(items[2].amountCents, 12040);
  assert.equal(items[2].type, 'expense');
  assert.equal(items[2].category, 'Energia');
});

test('Texto Copiado de App: extrai lançamentos com datas, valores e identificação de entrada/saída', () => {
  const sampleText = `
24/10/2026 - Padaria Pão Gostoso - R$ 22,50
23/10/2026 Pix recebido de Pedro R$ 200,00
21/10/2026 Uber Viagens R$ -34,80
20/10/2026 Cobasi Pet Shop R$ 115,00 D
`;

  const items = parseStatementText(sampleText);
  assert.equal(items.length, 4);

  // Padaria
  assert.equal(items[0].date, '2026-10-24');
  assert.match(items[0].description, /Padaria/i);
  assert.equal(items[0].amountCents, 2250);
  assert.equal(items[0].type, 'expense');
  assert.equal(items[0].category, 'Padaria');

  // Pix recebido
  assert.equal(items[1].date, '2026-10-23');
  assert.match(items[1].description, /Pix recebido/i);
  assert.equal(items[1].amountCents, 20000);
  assert.equal(items[1].type, 'income');

  // Uber
  assert.equal(items[2].date, '2026-10-21');
  assert.equal(items[2].amountCents, 3480);
  assert.equal(items[2].type, 'expense');
  assert.equal(items[2].category, 'Transporte');

  // Cobasi
  assert.equal(items[3].date, '2026-10-20');
  assert.equal(items[3].amountCents, 11500);
  assert.equal(items[3].type, 'expense');
  assert.equal(items[3].category, 'Pets');
});

test('Categorização: atribui categorias corretas para termos bancários e varejistas brasileiros', () => {
  assert.equal(categorizeTransaction('IFOOD *REFEICAO', 'expense'), 'Restaurantes e delivery');
  assert.equal(categorizeTransaction('SABESP AGUA', 'expense'), 'Água');
  assert.equal(categorizeTransaction('CLARO FIBRA INTERNET', 'expense'), 'Internet e telefone');
  assert.equal(categorizeTransaction('NETFLIX.COM', 'expense'), 'Assinaturas');
  assert.equal(categorizeTransaction('PROVENTOS FOLHA SALARIAL', 'income'), 'Salário');
  assert.equal(categorizeTransaction('REEMBOLSO PLANO SAUDE', 'income'), 'Renda extra');
});

test('Análise de Extrato: calcula resumo financeiro e detecta duplicidades existentes', () => {
  const existingTransactions = [
    {
      id: 'tx-1',
      accountId: 'acc-nubank',
      date: '2026-10-24',
      amountCents: 5000,
      description: 'Supermercado Dia'
    }
  ];

  const statementText = `
24/10/2026 Supermercado Dia R$ -50,00
24/10/2026 Farmacia Panvel R$ -30,00
23/10/2026 Salario Empresa R$ +4.000,00
`;

  const result = analyzeStatement({
    text: statementText,
    existingTransactions,
    accountId: 'acc-nubank',
    memberId: 'me'
  });

  assert.equal(result.candidates.length, 3);
  assert.equal(result.summary.totalIncomeCents, 400000);
  assert.equal(result.summary.totalExpenseCents, 8000);
  assert.equal(result.summary.netCents, 392000);
  assert.equal(result.summary.duplicateCount, 1);

  // A transação duplicada deve estar marcada como isDuplicate: true e selected: false
  const dup = result.candidates.find(c => c.description.includes('Supermercado Dia'));
  assert.ok(dup);
  assert.equal(dup.isDuplicate, true);
  assert.equal(dup.selected, false);

  // As outras transações devem estar marcadas com selected: true
  const newTx = result.candidates.find(c => c.description.includes('Farmacia Panvel'));
  assert.ok(newTx);
  assert.equal(newTx.isDuplicate, false);
  assert.equal(newTx.selected, true);
});
