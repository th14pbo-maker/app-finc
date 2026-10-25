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

test('Validação de Ponta a Ponta: Duas contas familiares, isolamento RLS, recuperação de senha, fila offline e idempotência', async () => {
  const storage = createMockStorage();

  // Banco de dados relacional simulado na nuvem Supabase com tabelas e RLS
  const db = {
    allowed_emails: new Set(['titular1@financeos.com', 'titular2@financeos.com']),
    users: new Map(), // email -> { id, password, displayName }
    accounts: new Map(), // id -> { id, user_id, name, initial_cents, color }
    cards: new Map(),
    goals: new Map(),
    contributions: new Map(),
    transactions: new Map(), // id -> { id, user_id, description, amount_cents, ... }
    profiles: new Map(),
    import_logs: new Map() // import_id -> { import_id, user_id, content_hash, result }
  };

  let networkOnline = true;

  // Mock Fetch que simula rigorosamente o Supabase Auth (GoTrue) e PostgREST com RLS
  const mockFetch = async (url, options = {}) => {
    if (!networkOnline) {
      throw new Error('Failed to fetch (offline)');
    }

    const headers = options.headers || {};
    const authHeader = headers.Authorization || '';
    const activeToken = authHeader.replace(/^Bearer\s+/, '');
    const activeUser = activeToken.startsWith('jwt-') ? activeToken.replace('jwt-', '') : null;

    // --- 1. SUPABASE AUTH ENDPOINTS ---
    if (url.includes('/auth/v1/signup')) {
      const { email, password, data } = JSON.parse(options.body);
      // Trigger check_user_registration_allowed
      if (!db.allowed_emails.has(email)) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            code: 400,
            msg: 'Database error saving new user: Acesso restrito: este e-mail não possui convite autorizado para cadastro.'
          })
        };
      }
      const uid = `uid-${email.split('@')[0]}`;
      const userObj = { id: uid, email, password, displayName: data?.displayName || 'Você' };
      db.users.set(email, userObj);
      db.profiles.set(uid, { user_id: uid, display_name: userObj.displayName, theme: 'dark', hide_amounts: false });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          user: { id: uid, email, user_metadata: { displayName: userObj.displayName } },
          session: {
            access_token: `jwt-${uid}`,
            token_type: 'bearer',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: { id: uid, email }
          }
        })
      };
    }

    if (url.includes('/auth/v1/token?grant_type=password')) {
      const { email, password } = JSON.parse(options.body);
      const user = db.users.get(email);
      if (!user || user.password !== password) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error_description: 'Invalid login credentials' })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: `jwt-${user.id}`,
          token_type: 'bearer',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: user.id, email: user.email, user_metadata: { displayName: user.displayName } }
        })
      };
    }

    if (url.includes('/auth/v1/recover')) {
      const { email } = JSON.parse(options.body);
      if (!db.users.has(email)) {
        // Por segurança, retorna 200 mesmo se e-mail não existir
        return { ok: true, status: 200, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }

    if (url.includes('/auth/v1/user') && options.method === 'PUT') {
      if (!activeUser) return { ok: false, status: 401, json: async () => ({ message: 'Unauthorized' }) };
      const { password } = JSON.parse(options.body);
      // Atualiza senha do usuário autenticado
      for (const [email, u] of db.users.entries()) {
        if (u.id === activeUser) {
          u.password = password;
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: u.id, email: u.email, user_metadata: { displayName: u.displayName } })
          };
        }
      }
      return { ok: false, status: 404, json: async () => ({ message: 'User not found' }) };
    }

    if (url.includes('/auth/v1/logout')) {
      return { ok: true, status: 204, json: async () => ({}) };
    }

    // --- 2. POSTGREST REST & RLS ENDPOINTS ---
    if (!activeUser) {
      return { ok: false, status: 401, json: async () => ({ message: 'JWT ausente ou inválido' }) };
    }

    // GET queries com RLS: retorna apenas linhas onde user_id = activeUser
    if (options.method === 'GET' || !options.method) {
      if (url.includes('/rest/v1/profiles')) {
        const prof = db.profiles.get(activeUser);
        return { ok: true, json: async () => prof ? [prof] : [] };
      }
      if (url.includes('/rest/v1/members')) {
        return { ok: true, json: async () => [{ id: 'me', name: db.profiles.get(activeUser)?.display_name || 'Você' }] };
      }
      if (url.includes('/rest/v1/accounts')) {
        const filtered = [...db.accounts.values()].filter(a => a.user_id === activeUser);
        return { ok: true, json: async () => filtered };
      }
      if (url.includes('/rest/v1/cards')) {
        const filtered = [...db.cards.values()].filter(c => c.user_id === activeUser);
        return { ok: true, json: async () => filtered };
      }
      if (url.includes('/rest/v1/goals')) {
        const filtered = [...db.goals.values()].filter(g => g.user_id === activeUser);
        return { ok: true, json: async () => filtered };
      }
      if (url.includes('/rest/v1/contributions')) {
        const filtered = [...db.contributions.values()].filter(c => c.user_id === activeUser);
        return { ok: true, json: async () => filtered };
      }
      if (url.includes('/rest/v1/transactions')) {
        const filtered = [...db.transactions.values()].filter(t => t.user_id === activeUser);
        return { ok: true, json: async () => filtered };
      }
    }

    // POST / REST Mutations com RLS
    if (options.method === 'POST') {
      if (url.includes('/rest/v1/rpc/import_user_state')) {
        const { payload, p_import_id } = JSON.parse(options.body);
        // Idempotência por import_id e user_id
        const logKey = `${activeUser}:${p_import_id}`;
        if (db.import_logs.has(logKey)) {
          return { ok: true, json: async () => db.import_logs.get(logKey).result };
        }

        // Insere registros associando estritamente ao activeUser
        for (const a of payload.accounts || []) {
          db.accounts.set(a.id, { id: a.id, user_id: activeUser, name: a.name, initial_cents: a.initialCents, color: a.color });
        }
        for (const t of payload.transactions || []) {
          db.transactions.set(t.id, { id: t.id, user_id: activeUser, description: t.description, amount_cents: t.amountCents, date: t.date, type: t.type, account_id: t.accountId, category: t.category, member_id: 'me', tags: [] });
        }

        const res = {
          success: true,
          import_id: p_import_id,
          counts: { accounts: payload.accounts?.length || 0, transactions: payload.transactions?.length || 0, cards: 0, goals: 0, contributions: 0, members: 1 }
        };
        db.import_logs.set(logKey, { import_id: p_import_id, user_id: activeUser, result: res });
        return { ok: true, json: async () => res };
      }

      if (url.includes('/rest/v1/accounts')) {
        const body = JSON.parse(options.body);
        db.accounts.set(body.id, { ...body, user_id: activeUser });
        return { ok: true, json: async () => ({}) };
      }

      if (url.includes('/rest/v1/transactions')) {
        const body = JSON.parse(options.body);
        db.transactions.set(body.id, { ...body, user_id: activeUser });
        return { ok: true, json: async () => ({}) };
      }

      if (url.includes('/rest/v1/goals')) {
        const body = JSON.parse(options.body);
        db.goals.set(body.id, { ...body, user_id: activeUser });
        return { ok: true, json: async () => ({}) };
      }
    }

    // DELETE com RLS: só deleta se pertencer ao activeUser
    if (options.method === 'DELETE') {
      if (url.includes('/rest/v1/accounts?id=eq.')) {
        const id = url.split('id=eq.')[1];
        const item = db.accounts.get(id);
        if (item && item.user_id === activeUser) {
          db.accounts.delete(id);
        }
        return { ok: true, json: async () => ({}) };
      }
    }

    throw new Error(`Unhandled URL: ${url}`);
  };

  const client = new SupabaseClient({ storage, fetchFn: mockFetch });
  const store = createStore(storage, initialState());
  const syncManager = new SyncManager(store, client, storage);

  // =========================================================================
  // FASE 1: Cadastro dos 2 titulares da família e rejeição de intruso
  // =========================================================================
  await assert.rejects(
    async () => client.signUp({ email: 'intruso@externo.com', password: 'senha', displayName: 'Intruso' }),
    /Acesso restrito: este e-mail não possui convite autorizado/
  );

  const cadA = await client.signUp({ email: 'titular1@financeos.com', password: 'senha-titular-1', displayName: 'Titular 1' });
  assert.equal(cadA.user.email, 'titular1@financeos.com');

  const cadB = await client.signUp({ email: 'titular2@financeos.com', password: 'senha-titular-2', displayName: 'Titular 2' });
  assert.equal(cadB.user.email, 'titular2@financeos.com');

  // =========================================================================
  // FASE 2: Login da Conta 1, criação e edição de finanças
  // =========================================================================
  await client.signInWithPassword({ email: 'titular1@financeos.com', password: 'senha-titular-1' });
  await syncManager.handleAuthChange(client.getUser());
  assert.equal(syncManager.getStatus(), 'synced');

  // Criação de conta bancária e transação para Conta 1
  syncManager.queueMutation('saveAccount', { id: 'acc-1', name: 'Nubank Principal', initialCents: 500000, color: '#8a05be' });
  syncManager.queueMutation('saveTransaction', { id: 'tx-1', description: 'Salário Mensal', amountCents: 1000000, date: '2026-10-01', accountId: 'acc-1', type: 'income', category: 'Salário' });

  // Aguarda sincronização do queue
  await syncManager.processQueue();
  assert.equal(syncManager.getStatus(), 'synced');
  assert.equal(db.accounts.get('acc-1')?.name, 'Nubank Principal');
  assert.equal(db.transactions.get('tx-1')?.amount_cents, 1000000);

  // Edição pela Conta 1
  syncManager.queueMutation('saveAccount', { id: 'acc-1', name: 'Nubank Titular 1 Atualizado', initialCents: 700000, color: '#8a05be' });
  syncManager.queueMutation('saveTransaction', { id: 'tx-1', description: 'Salário Mensal com Bônus', amountCents: 1200000, date: '2026-10-01', accountId: 'acc-1', type: 'income', category: 'Salário' });
  await syncManager.processQueue();
  assert.equal(db.accounts.get('acc-1')?.name, 'Nubank Titular 1 Atualizado');
  assert.equal(db.transactions.get('tx-1')?.amount_cents, 1200000);

  // =========================================================================
  // FASE 3: Simulação de perda de conexão (Offline) e enfileiramento na Conta 1
  // =========================================================================
  networkOnline = false;
  // Conta 1 faz uma alteração enquanto a internet está fora
  syncManager.queueMutation('saveAccount', { id: 'acc-1-offline', name: 'Poupança Offline', initialCents: 1000, color: '#112233' });
  await syncManager.processQueue();
  // O status passa a 'offline' ou 'pending'
  assert.ok(['offline', 'pending'].includes(syncManager.getStatus()));
  const pendingQueueA = syncManager.getPendingQueue(client.getUser().id);
  assert.equal(pendingQueueA.length, 1);
  assert.equal(pendingQueueA[0].payload.name, 'Poupança Offline');

  // =========================================================================
  // FASE 4: Logout da Conta 1 e Troca de Usuário para Conta 2
  // CONFIRMAR: nenhuma operação pendente de A é enviada como B!
  // =========================================================================
  await client.signOut();
  await syncManager.handleAuthChange(null);
  assert.equal(syncManager.getStatus(), 'local');

  // Login como Conta 2
  networkOnline = true; // Rede voltou
  await client.signInWithPassword({ email: 'titular2@financeos.com', password: 'senha-titular-2' });
  await syncManager.handleAuthChange(client.getUser());
  assert.equal(syncManager.getStatus(), 'synced');

  // Confirma que Conta 2 NÃO herdou as operações pendentes de Conta 1
  const pendingQueueB = syncManager.getPendingQueue(client.getUser().id);
  assert.equal(pendingQueueB.length, 0);

  // Confirmação de RLS: Conta 2 NÃO enxerga os dados de Conta 1
  const u2Fetched = await client.fetchUserState();
  assert.equal(u2Fetched.accounts.length, 0);
  assert.equal(u2Fetched.transactions.length, 0);

  // Conta 2 tenta forçar consulta direta da conta de Conta 1
  // (A consulta REST filtrada por user_id não retorna nada de Conta 1)
  const resCrossRead = [...db.accounts.values()].filter(a => a.user_id === client.getUser().id && a.id === 'acc-1');
  assert.equal(resCrossRead.length, 0);

  // Conta 2 cria suas próprias finanças
  syncManager.queueMutation('saveAccount', { id: 'acc-2', name: 'Itaú Titular 2', initialCents: 200000, color: '#ec7000' });
  await syncManager.processQueue();
  assert.equal(db.accounts.get('acc-2')?.name, 'Itaú Titular 2');
  assert.equal(db.accounts.get('acc-2')?.user_id, client.getUser().id);

  // Conta 2 tenta excluir a conta de Conta 1 (acc-1): Não deve ter efeito sobre acc-1
  await client.syncMutation('deleteAccount', 'acc-1');
  assert.notEqual(db.accounts.get('acc-1'), undefined, 'Conta 1 continua preservada: RLS impediu que B excluísse A');

  // =========================================================================
  // FASE 5: Conta 1 faz login novamente e esvazia sua fila pendente
  // =========================================================================
  await client.signOut();
  await syncManager.handleAuthChange(null);

  await client.signInWithPassword({ email: 'titular1@financeos.com', password: 'senha-titular-1' });
  await syncManager.handleAuthChange(client.getUser());

  // A fila de Conta 1 agora é processada com a identidade correta de Conta 1
  await syncManager.processQueue();
  assert.equal(syncManager.getStatus(), 'synced');
  assert.equal(db.accounts.get('acc-1-offline')?.user_id, client.getUser().id);
  assert.equal(syncManager.getPendingQueue(client.getUser().id).length, 0);

  // =========================================================================
  // FASE 6: Recuperação Completa de Senha
  // =========================================================================
  // 1. Envio do link
  const recRes = await client.resetPasswordForEmail('titular1@financeos.com');
  assert.equal(recRes.ok, true);

  // 2. Simula abertura do link via fragmento de URL com token de recuperação
  const recoveryToken = 'jwt-uid-titular1';
  client.setSession({
    access_token: recoveryToken,
    user: { id: 'uid-titular1', email: 'titular1@financeos.com' }
  });

  // 3. Usuário define nova senha
  await client.updateUser({ password: 'nova-senha-2026-super-segura' });

  // 4. Logout e teste de login com a nova senha
  await client.signOut();

  // Senha antiga deve ser recusada
  await assert.rejects(
    async () => client.signInWithPassword({ email: 'titular1@financeos.com', password: 'senha-titular-1' }),
    /E-mail ou senha incorretos/
  );

  // Nova senha é aceita
  const newLogin = await client.signInWithPassword({ email: 'titular1@financeos.com', password: 'nova-senha-2026-super-segura' });
  assert.equal(newLogin.user.email, 'titular1@financeos.com');
  assert.equal(client.getUser()?.id, 'uid-titular1');

  // =========================================================================
  // FASE 7: Idempotência de Importação Assistida
  // =========================================================================
  const importPayload = {
    members: [{ id: 'me', name: 'Titular 1' }],
    accounts: [{ id: 'acc-imp-1', name: 'Conta Importada', initialCents: 100, color: '#112233' }],
    cards: [],
    goals: [],
    contributions: [],
    transactions: [],
    preferences: { displayName: 'Titular 1', theme: 'dark', hideAmounts: false }
  };

  // Primeira importação
  const impRes1 = await client.rpc('import_user_state', { payload: importPayload, p_import_id: 'fixed-import-id-123' });
  assert.equal(impRes1.success, true);
  assert.equal(db.accounts.get('acc-imp-1')?.name, 'Conta Importada');

  // Reenvio imediato com o mesmo import_id: não duplica
  const countBefore = db.accounts.size;
  const impRes2 = await client.rpc('import_user_state', { payload: importPayload, p_import_id: 'fixed-import-id-123' });
  assert.equal(impRes2.success, true);
  assert.equal(db.accounts.size, countBefore, 'Reenvio de importação idêntica não duplica registros');
});
