import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, VISITOR_KEY } from '../app/js/store.mjs';
import { initialState } from '../app/js/initial-state.mjs';
import { SupabaseClient } from '../app/js/supabase.mjs';
import { SyncManager } from '../app/js/sync.mjs';

function createMockStorage() {
  const map = new Map();
  return {
    getItem: k => map.get(k) || null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    clear: () => map.clear()
  };
}

test('Importação assistida: validação atômica, RPC import_user_state, preservação de dados de visitante e confirmação de sincronizado', async () => {
  const storage = createMockStorage();

  // 1. Visitante cria contas e transações
  const visitorData = {
    members: [{ id: 'me', name: 'Você' }],
    accounts: [{ id: 'acc-vis-1', name: 'Nubank Local', initialCents: 50000, color: '#8a05be' }],
    cards: [],
    goals: [],
    contributions: [],
    transactions: [
      { id: 'tx-vis-1', description: 'Mercado Local', type: 'expense', amountCents: 15000, date: '2026-10-25', accountId: 'acc-vis-1', category: 'Mercado', memberId: 'me', tags: [] }
    ],
    preferences: { displayName: 'Você', theme: 'dark', hideAmounts: false }
  };
  storage.setItem(VISITOR_KEY, JSON.stringify(visitorData));

  let rpcCalled = false;
  let receivedRpcParams = null;
  let remoteStateRefreshed = false;

  const mockFetch = async (url, options) => {
    if (url.includes('/rest/v1/rpc/import_user_state')) {
      rpcCalled = true;
      receivedRpcParams = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          import_id: receivedRpcParams.p_import_id,
          imported_at: '2026-10-25T12:00:00Z',
          counts: { members: 1, accounts: 1, cards: 0, goals: 0, contributions: 0, transactions: 1 }
        })
      };
    }

    if (url.includes('/rest/v1/')) {
      remoteStateRefreshed = true;
      if (url.includes('profiles')) return { ok: true, json: async () => [{ display_name: 'Você', theme: 'dark', hide_amounts: false }] };
      if (url.includes('members')) return { ok: true, json: async () => [{ id: 'me', name: 'Você' }] };
      if (url.includes('accounts')) return { ok: true, json: async () => [{ id: 'acc-vis-1', name: 'Nubank Local', initial_cents: 50000, color: '#8a05be' }] };
      if (url.includes('cards')) return { ok: true, json: async () => [] };
      if (url.includes('goals')) return { ok: true, json: async () => [] };
      if (url.includes('contributions')) return { ok: true, json: async () => [] };
      if (url.includes('transactions')) {
        return {
          ok: true,
          json: async () => [{
            id: 'tx-vis-1',
            description: 'Mercado Local',
            type: 'expense',
            amount_cents: 15000,
            date: '2026-10-25',
            account_id: 'acc-vis-1',
            category: 'Mercado',
            member_id: 'me',
            tags: []
          }]
        };
      }
    }

    throw new Error(`Unhandled mock url: ${url}`);
  };

  const client = new SupabaseClient({ storage, fetchFn: mockFetch });
  // Simula usuário autenticado
  client.currentSession = {
    access_token: 'valid-jwt-token',
    user: { id: 'user-family-titular', email: 'titular@financeos.com' }
  };

  const store = createStore(storage, initialState());
  const syncManager = new SyncManager(store, client, storage);
  syncManager.currentUser = client.currentSession.user;

  // Verifica que dados de visitante foram detectados
  assert.equal(syncManager.hasVisitorData(), true);

  // Executa importação assistida
  const res = await syncManager.performAssistedImport();

  // Valida que a RPC foi chamada com os parâmetros certos
  assert.equal(rpcCalled, true);
  assert.equal(typeof receivedRpcParams.p_import_id, 'string');
  assert.equal(receivedRpcParams.payload.accounts[0].name, 'Nubank Local');

  // Valida que status passou a "synced" APENAS após confirmação do banco
  assert.equal(res.success, true);
  assert.equal(syncManager.getStatus(), 'synced');
  assert.equal(remoteStateRefreshed, true);

  // Valida que os dados de visitante em finance-os:personal:v1 foram preservados
  const savedVisitorBackup = JSON.parse(storage.getItem(VISITOR_KEY));
  assert.equal(savedVisitorBackup.accounts[0].name, 'Nubank Local');
  assert.equal(savedVisitorBackup.transactions[0].description, 'Mercado Local');
});
