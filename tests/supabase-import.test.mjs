import test from 'node:test';
import assert from 'node:assert/strict';
import {validateImportPayload, computePayloadHash, isValidUuid} from '../app/js/import-payload.mjs';

test('Validação de payload no cliente: validação estrutural completa, detecção de IDs e integridade relacional', () => {
  // 1. Detecção correta de UUID
  assert.equal(isValidUuid('me'), false);
  assert.equal(isValidUuid('acc-123'), false);
  assert.equal(isValidUuid('12345678-1234-1234-1234-123456789abc'), true);

  // 2. Payload válido completo
  const validState = {
    accounts: [
      { id: 'acc-1', name: 'Nubank', initialCents: 50000, color: '#8a05be' },
      { id: 'acc-2', name: 'Itaú', initialCents: 100000, color: '#ec7000' }
    ],
    cards: [
      { id: 'card-1', name: 'Roxinho', limitCents: 300000, color: '#8a05be', closingDay: 10, dueDay: 20 }
    ],
    goals: [
      { id: 'goal-1', name: 'Carro novo', kind: 'car', targetCents: 7000000, initialCents: 0, targetDate: '2027-10-01' }
    ],
    contributions: [
      { id: 'cont-1', goalId: 'goal-1', date: '2026-10-25', amountCents: 1000000 }
    ],
    members: [
      { id: 'me', name: 'Você' }
    ],
    transactions: [
      {
        id: 'tx-1',
        description: 'Salário',
        type: 'income',
        amountCents: 500000,
        date: '2026-10-05',
        accountId: 'acc-1',
        category: 'Salário',
        memberId: 'me',
        tags: []
      },
      {
        id: 'tx-2',
        description: 'Transferência para reserva',
        type: 'transfer',
        amountCents: 100000,
        date: '2026-10-06',
        accountId: 'acc-1',
        toAccountId: 'acc-2',
        category: 'Outros',
        memberId: 'me',
        tags: []
      },
      {
        id: 'tx-3',
        description: 'Compra no mercado',
        type: 'cardPurchase',
        amountCents: 25000,
        date: '2026-10-10',
        cardId: 'card-1',
        category: 'Mercado',
        memberId: 'me',
        tags: ['mercado']
      },
      {
        id: 'tx-4',
        description: 'Pagamento fatura Roxinho',
        type: 'cardPayment',
        amountCents: 25000,
        date: '2026-10-20',
        accountId: 'acc-1',
        cardId: 'card-1',
        invoiceMonth: '2026-10',
        category: 'Outros',
        memberId: 'me',
        tags: []
      }
    ],
    preferences: {
      displayName: 'Você',
      theme: 'dark',
      hideAmounts: false
    }
  };

  assert.equal(validateImportPayload(validState), true);

  // 3. Rejeita payload não-objeto
  assert.throws(() => validateImportPayload(null), /não é um objeto JSON válido/);
  assert.throws(() => validateImportPayload([]), /não é um objeto JSON válido/);

  // 4. Rejeita coleção ausente ou não-array
  const missingCol = structuredClone(validState);
  delete missingCol.accounts;
  assert.throws(() => validateImportPayload(missingCol), /Coleção obrigatória "accounts" ausente/);

  const nonArrayCol = structuredClone(validState);
  nonArrayCol.cards = {};
  assert.throws(() => validateImportPayload(nonArrayCol), /não é um array JSON/);

  // 5. Rejeita preferências ausentes
  const missingPrefs = structuredClone(validState);
  delete missingPrefs.preferences;
  assert.throws(() => validateImportPayload(missingPrefs), /Objeto de preferências/);

  // 6. Rejeita IDs duplicados dentro de cada entidade
  const dupAccount = structuredClone(validState);
  dupAccount.accounts.push({ id: 'acc-1', name: 'Conta Clonada', initialCents: 0, color: '#112233' });
  assert.throws(() => validateImportPayload(dupAccount), /ID duplicado na coleção de contas/);

  const dupContrib = structuredClone(validState);
  dupContrib.contributions.push({ id: 'cont-1', goalId: 'goal-1', date: '2026-10-25', amountCents: 500 });
  assert.throws(() => validateImportPayload(dupContrib), /ID duplicado na coleção de aportes/);

  const dupTx = structuredClone(validState);
  dupTx.transactions.push({ id: 'tx-1', description: 'Duplicado', type: 'income', amountCents: 100, date: '2026-10-01', accountId: 'acc-1', category: 'X', memberId: 'me' });
  assert.throws(() => validateImportPayload(dupTx), /ID duplicado na coleção de transações/);

  // 7. Rejeita referências informadas inexistentes
  const ghostMember = structuredClone(validState);
  ghostMember.transactions[0].memberId = 'membro-fantasma';
  assert.throws(() => validateImportPayload(ghostMember), /referencia memberId inexistente/);

  const ghostAccount = structuredClone(validState);
  ghostAccount.transactions[0].accountId = 'conta-fantasma';
  assert.throws(() => validateImportPayload(ghostAccount), /referencia accountId inexistente/);

  const ghostCard = structuredClone(validState);
  ghostCard.transactions[2].cardId = 'cartao-fantasma';
  assert.throws(() => validateImportPayload(ghostCard), /referencia cardId inexistente/);

  const ghostGoal = structuredClone(validState);
  ghostGoal.contributions[0].goalId = 'meta-fantasma';
  assert.throws(() => validateImportPayload(ghostGoal), /referencia meta inexistente/);

  // 8. Rejeita regras de tipo de transação violadas
  const invalidCardPayment = structuredClone(validState);
  invalidCardPayment.transactions[3].invoiceMonth = null;
  assert.throws(() => validateImportPayload(invalidCardPayment), /exige o mês da fatura/);

  const invalidTransfer = structuredClone(validState);
  invalidTransfer.transactions[1].toAccountId = 'acc-1';
  assert.throws(() => validateImportPayload(invalidTransfer), /não pode ter a mesma conta como origem e destino/);
});

test('Cálculo de hash de payload para idempotência', async () => {
  const payload1 = {
    accounts: [{ id: 'a1', name: 'Conta A', initialCents: 1000, color: '#112233' }],
    preferences: { displayName: 'User' }
  };
  const payload2 = {
    accounts: [{ id: 'a1', name: 'Conta A', initialCents: 1000, color: '#112233' }],
    preferences: { displayName: 'User' }
  };
  const payloadDifferent = {
    accounts: [{ id: 'a1', name: 'Conta B', initialCents: 2000, color: '#112233' }],
    preferences: { displayName: 'User' }
  };

  const hash1 = await computePayloadHash(payload1);
  const hash2 = await computePayloadHash(payload2);
  const hashDiff = await computePayloadHash(payloadDifferent);

  assert.equal(typeof hash1, 'string');
  assert.equal(hash1.length, 64, 'SHA-256 deve ter 64 caracteres hexadecimais');
  assert.equal(hash1, hash2, 'Payloads idênticos devem gerar o mesmo hash SHA-256');
  assert.notEqual(hash1, hashDiff, 'Payloads diferentes devem gerar hashes diferentes');
});
