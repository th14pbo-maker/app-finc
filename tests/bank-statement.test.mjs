import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseOfx,
  parseCsv,
  parseStatementText,
  categorizeTransaction,
  analyzeStatement,
  isBalanceLine,
  CREDIT_KEYWORDS,
  DEBIT_KEYWORDS
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

test('Filtro de linhas de saldo: descarta SALDO ANTERIOR, SALDO FINAL, SDO DO DIA e resumos em OFX, CSV e Texto', () => {
  // Regex direto
  assert.equal(isBalanceLine('SALDO ANTERIOR'), true);
  assert.equal(isBalanceLine('SALDO INICIAL'), true);
  assert.equal(isBalanceLine('SALDO FINAL'), true);
  assert.equal(isBalanceLine('SALDO DO DIA'), true);
  assert.equal(isBalanceLine('SALDO ATUAL'), true);
  assert.equal(isBalanceLine('SDO DO DIA'), true);
  assert.equal(isBalanceLine('TOTAL DE ENTRADAS'), true);
  assert.equal(isBalanceLine('TOTAL DE SAIDAS'), true);
  assert.equal(isBalanceLine('RESUMO DO DIA'), true);
  assert.equal(isBalanceLine('SALARIO MENSAL'), false);
  assert.equal(isBalanceLine('PAGAMENTO FATURA CARTAO'), false);
  assert.equal(isBalanceLine('SUPERMERCADO'), false);

  // No CSV
  const csvWithBalance = `Data;Descrição;Valor
01/10/2026;SALDO ANTERIOR;12.200,00
10/10/2026;PIX RECEBIDO JOAO;100,00
31/10/2026;SALDO FINAL;12.300,00`;
  const csvParsed = parseCsv(csvWithBalance);
  assert.equal(csvParsed.length, 1);
  assert.equal(csvParsed[0].description, 'PIX RECEBIDO JOAO');

  // No Texto Livre
  const textWithBalance = `
01/10/2026 SALDO ANTERIOR R$ 12.200,00
10/10/2026 Pix recebido de Carlos R$ 100,00
12/10/2026 Farmacia Raia R$ -45,00
31/10/2026 SALDO FINAL R$ 12.255,00`;
  const textParsed = parseStatementText(textWithBalance);
  assert.equal(textParsed.length, 2);
  assert.equal(textParsed[0].description, 'Pix recebido de Carlos');
  assert.equal(textParsed[1].description, 'Farmacia Raia');
});

test('Identificação de créditos: classifica transferências recebidas como receita mesmo sem sinal +', () => {
  // CSV com créditos sem sinal de + e débitos com sinal de -
  const csv = `Data;Descricao;Valor
10/10/2026;PIX TRANSF JOAO DA SILVA;100,00
11/10/2026;TED RECEBIDA EMPRESA;1500,00
12/10/2026;MERCADO EXTRA;-50,00`;
  const items = parseCsv(csv);
  assert.equal(items.length, 3);
  assert.equal(items[0].type, 'income');
  assert.equal(items[0].amountCents, 10000);
  assert.equal(items[1].type, 'income');
  assert.equal(items[1].amountCents, 150000);
  assert.equal(items[2].type, 'expense');
  assert.equal(items[2].amountCents, 5000);

  // Texto com Pix recebido
  const text = `
10/10/2026 Transferencia recebida pelo Pix R$ 250,00
11/10/2026 Deposito em conta R$ 400,00
12/10/2026 Pagamento boleto energia R$ 120,00`;
  const textItems = parseStatementText(text);
  assert.equal(textItems.length, 3);
  assert.equal(textItems[0].type, 'income');
  assert.equal(textItems[1].type, 'income');
  assert.equal(textItems[2].type, 'expense');
});

test('OFX: suporta vírgula decimal e descarta registros de saldo', () => {
  const ofx = `
<OFX>
<STMTTRN>
<TRNTYPE>OTHER
<DTPOSTED>20261001120000
<TRNAMT>12200,00
<MEMO>SALDO ANTERIOR
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261010120000
<TRNAMT>100,00
<MEMO>PIX RECEBIDO JOAO
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261012120000
<TRNAMT>-50,00
<MEMO>MERCADO CARREFOUR
</STMTTRN>
</OFX>`;

  const items = parseOfx(ofx);
  assert.equal(items.length, 2);
  assert.equal(items[0].description, 'PIX RECEBIDO JOAO');
  assert.equal(items[0].type, 'income');
  assert.equal(items[0].amountCents, 10000);

  assert.equal(items[1].description, 'MERCADO CARREFOUR');
  assert.equal(items[1].type, 'expense');
  assert.equal(items[1].amountCents, 5000);
});

test('Cenário Financeiro Completo: saldo inicial R$ 500,00, entrada Pix R$ 100,00, despesas R$ 50,00 e R$ 25,90 -> Saldo R$ 524,10', () => {
  const initialBalanceCents = 50000; // R$ 500,00

  const statement = `
01/10/2026 SALDO ANTERIOR R$ 12.200,00
10/10/2026 PIX RECEBIDO JOAO R$ 100,00
12/10/2026 SUPERMERCADO R$ -50,00
15/10/2026 FARMACIA R$ -25,90
31/10/2026 SALDO FINAL R$ 12.224,10`;

  const parsed = parseStatementText(statement);
  assert.equal(parsed.length, 3); // Apenas as 3 transações reais

  const incomeCents = parsed.filter(t => t.type === 'income').reduce((s, t) => s + t.amountCents, 0);
  const expenseCents = parsed.filter(t => t.type === 'expense').reduce((s, t) => s + t.amountCents, 0);

  assert.equal(incomeCents, 10000); // R$ 100,00
  assert.equal(expenseCents, 7590);  // R$ 75,90

  const netCents = incomeCents - expenseCents;
  assert.equal(netCents, 2410); // + R$ 24,10

  const finalAccountBalanceCents = initialBalanceCents + netCents;
  assert.equal(finalAccountBalanceCents, 52410); // R$ 524,10 positivo
});

test('Sanitização: identifica linhas de saldo para exclusão e créditos invertidos para conversão', () => {
  const existingCorrupted = [
    { id: '1', accountId: 'acc-1', description: 'SALDO ANTERIOR', amountCents: 1220000, type: 'expense' },
    { id: '2', accountId: 'acc-1', description: 'PIX TRANSF DE MARCOS', amountCents: 10000, type: 'expense' },
    { id: '3', accountId: 'acc-1', description: 'SUPERMERCADO DIA', amountCents: 5000, type: 'expense' }
  ];

  const badBalances = existingCorrupted.filter(t => isBalanceLine(t.description));
  const badCredits = existingCorrupted.filter(t => t.type === 'expense' && CREDIT_KEYWORDS.test(t.description.toLowerCase()) && !DEBIT_KEYWORDS.test(t.description.toLowerCase()));

  assert.equal(badBalances.length, 1);
  assert.equal(badBalances[0].id, '1');

  assert.equal(badCredits.length, 1);
  assert.equal(badCredits[0].id, '2');
});
