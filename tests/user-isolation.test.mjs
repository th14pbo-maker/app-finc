import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, VISITOR_KEY } from '../app/js/store.mjs';
import { initialState } from '../app/js/initial-state.mjs';
import { SupabaseClient } from '../app/js/supabase.mjs';
import { SyncManager, getUserStorageKey, getUserQueueKey } from '../app/js/sync.mjs';

function createMockStorage() {
  const map = new Map();
  return {
    getItem: k => map.get(k) || null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    clear: () => map.clear(),
    dump: () => Object.fromEntries(map.entries())
  };
}

test('Isolamento de Memória, Cache e Filas de Sincronização entre dois usuários', async () => {
  const storage = createMockStorage();

  // 1. Visitante cria dados no modo local
  const visitorInitial = initialState();
  visitorInitial.accounts = [{ id: 'acc-visitor', name: 'Conta Visitante', initialCents: 5000, color: '#112233' }];
  storage.setItem(VISITOR_KEY, JSON.stringify(visitorInitial));

  // Banco em memória simulado por usuário
  const userDatabases = {
    'user-1': {
      accounts: [{ id: 'acc-u1', name: 'Conta Titular 1', initial_cents: 10000, color: '#8a05be' }],
      cards: [],
      goals: [],
      contributions: [],
      members: [{ id: 'me', name: 'Usuário 1' }],
      transactions: [{ id: 'tx-u1', description: 'Salário 1', type: 'income', amount_cents: 300000, date: '2026-10-01', account_id: 'acc-u1', category: 'Salário' }],
      profiles: [{ display_name: 'Usuário 1', theme: 'dark', hide_amounts: false }]
    },
    'user-2': {
      accounts: [{ id: 'acc-u2', name: 'Conta Titular 2', initial_cents: 20000, color: '#ec7000' }],
      cards: [],
      goals: [],
      contributions: [],
      members: [{ id: 'me', name: 'Usuário 2' }],
      transactions: [{ id: 'tx-u2', description: 'Salário 2', type: 'income', amount_cents: 450000, date: '2026-10-01', account_id: 'acc-u2', category: 'Salário' }],
      profiles: [{ display_name: 'Usuário 2', theme: 'light', hide_amounts: true }]
    }
  };

  let currentUserContext = null;

  const mockFetch = async (url, options) => {
    // Auth endpoints
    if (url.includes('/auth/v1/token?grant_type=password')) {
      const { email } = JSON.parse(options.body);
      const uid = email === 'user1@financeos.com' ? 'user-1' : 'user-2';
      currentUserContext = uid;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: `jwt-${uid}`,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: uid, email }
        })
      };
    }

    if (url.includes('/auth/v1/logout')) {
      currentUserContext = null;
      return { ok: true, status: 204, json: async () => ({}) };
    }

    // PostgREST REST endpoints com validação de RLS baseada no token ativo
    const authHeader = options.headers?.Authorization || '';
    const tokenUid = authHeader.replace('Bearer jwt-', '');
    const db = userDatabases[tokenUid];
    if (!db) {
      return { ok: false, status: 401, json: async () => ({ message: 'Unauthorized' }) };
    }

    if (url.includes('/rest/v1/profiles')) return { ok: true, json: async () => db.profiles };
    if (url.includes('/rest/v1/members')) return { ok: true, json: async () => db.members };
    if (url.includes('/rest/v1/accounts')) return { ok: true, json: async () => db.accounts };
    if (url.includes('/rest/v1/cards')) return { ok: true, json: async () => db.cards };
    if (url.includes('/rest/v1/goals')) return { ok: true, json: async () => db.goals };
    if (url.includes('/rest/v1/contributions')) return { ok: true, json: async () => db.contributions };
    if (url.includes('/rest/v1/transactions')) return { ok: true, json: async () => db.transactions };

    // Mutations
    if (options.method === 'POST') {
      return { ok: true, json: async () => ({}) };
    }

    throw new Error(`Unhandled mock url: ${url}`);
  };

  const client = new SupabaseClient({ storage, fetchFn: mockFetch });
  const store = createStore(storage, initialState());
  const syncManager = new SyncManager(store, client, storage);

  // A. Estado inicial em modo visitante
  assert.equal(syncManager.getStatus(), 'local');
  assert.equal(store.getState().accounts[0].name, 'Conta Visitante');

  // B. Usuário 1 faz Login
  await client.signInWithPassword({ email: 'user1@financeos.com', password: 'password' });
  assert.equal(client.getUser()?.id, 'user-1');

  // Força ciclo de auth
  await syncManager.handleAuthChange(client.getUser());
  assert.equal(syncManager.getStatus(), 'synced');

  // Verifica isolamento: Memória contém apenas dados de Usuário 1
  const u1State = store.getState();
  assert.equal(u1State.accounts.length, 1);
  assert.equal(u1State.accounts[0].id, 'acc-u1');
  assert.equal(u1State.transactions[0].id, 'tx-u1');
  assert.equal(u1State.transactions[0].amountCents, 300000);

  // Usuário 1 enfileira uma alteração
  syncManager.queueMutation('saveAccount', { id: 'acc-u1-extra', name: 'Poupança 1', initialCents: 500, color: '#334455' });
  const u1Queue = syncManager.getPendingQueue('user-1');
  assert.equal(u1Queue.length, 1);
  assert.equal(u1Queue[0].payload.name, 'Poupança 1');

  // C. Usuário 1 faz Logout
  await client.signOut();
  await syncManager.handleAuthChange(null);

  // Memória é limpa: dados privados de Usuário 1 NÃO permanecem na memória
  assert.equal(syncManager.getStatus(), 'local');
  const visitorReloaded = store.getState();
  assert.equal(visitorReloaded.accounts[0].name, 'Conta Visitante');
  assert.equal(visitorReloaded.transactions.length, 0);

  // D. Usuário 2 faz Login
  await client.signInWithPassword({ email: 'user2@financeos.com', password: 'password' });
  assert.equal(client.getUser()?.id, 'user-2');
  await syncManager.handleAuthChange(client.getUser());
  assert.equal(syncManager.getStatus(), 'synced');

  // Memória de Usuário 2 NÃO contém dados de Usuário 1
  const u2State = store.getState();
  assert.equal(u2State.accounts.length, 1);
  assert.equal(u2State.accounts[0].id, 'acc-u2');
  assert.equal(u2State.accounts[0].name, 'Conta Titular 2');
  assert.equal(u2State.transactions[0].id, 'tx-u2');
  assert.equal(u2State.transactions[0].amountCents, 450000);

  // Fila de Usuário 2 é completamente separada da fila de Usuário 1
  const u2Queue = syncManager.getPendingQueue('user-2');
  assert.equal(u2Queue.length, 0);

  // O cache de Usuário 1 no storage existe mas continua isolado de Usuário 2
  assert.notEqual(storage.getItem(getUserStorageKey('user-1')), null);
  assert.notEqual(storage.getItem(getUserStorageKey('user-2')), null);
  assert.notEqual(storage.getItem(getUserStorageKey('user-1')), storage.getItem(getUserStorageKey('user-2')));

  // Dados do visitante permanecem intactos sem modificação
  const visitorBackup = JSON.parse(storage.getItem(VISITOR_KEY));
  assert.equal(visitorBackup.accounts[0].name, 'Conta Visitante');
});
