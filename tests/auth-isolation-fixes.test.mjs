import test from 'node:test';
import assert from 'node:assert/strict';

// Mock DOM for Node.js test environment
class MockElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.attributes = {};
    this.children = [];
    this.className = '';
  }
  setAttribute(k, v) { this.attributes[k.toLowerCase()] = String(v); }
  getAttribute(k) { return this.attributes[k.toLowerCase()]; }
  append(...nodes) {
    for (const n of nodes) {
      if (n != null) this.children.push(n);
    }
  }
  get textContent() {
    return this.children.map(c => typeof c === 'string' ? c : c?.textContent || '').join('');
  }
}

globalThis.Node = MockElement;
globalThis.document = {
  createElement(tag) { return new MockElement(tag); },
  createElementNS(ns, tag) { return new MockElement(tag); },
  createTextNode(text) { return text; }
};

const { createStore, VISITOR_KEY } = await import('../app/js/store.mjs');
const { initialState } = await import('../app/js/initial-state.mjs');
const { SupabaseClient } = await import('../app/js/supabase.mjs');
const { SyncManager } = await import('../app/js/sync.mjs');
const { userAvatar } = await import('../app/js/ui.mjs');

function createMockStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: k => map.get(k) || null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    clear: () => map.clear(),
    dump: () => Object.fromEntries(map.entries())
  };
}

test('Correção 1: Novo usuário sem avatar_preset não recebe mais "man-light" (👨🏻)', async () => {
  const storage = createMockStorage();

  const mockFetch = async (url) => {
    if (url.includes('/rest/v1/profiles')) {
      return {
        ok: true,
        json: async () => [{
          display_name: 'Thayná Soares',
          theme: 'dark',
          hide_amounts: false,
          avatar_preset: null,
          avatar_emoji: null,
          avatar_data: null
        }]
      };
    }
    return { ok: true, json: async () => [] };
  };

  const client = new SupabaseClient({
    storage,
    fetchFn: mockFetch
  });

  client.setSession({
    access_token: 'fake-jwt',
    user: { id: 'user-thayna', email: 'thayna@example.com', user_metadata: { displayName: 'Thayná Soares' } }
  });

  const state = await client.fetchUserState();

  assert.equal(state.preferences.avatarPreset, '', 'avatarPreset deve ser vazio e não o avatar masculino man-light');
  assert.equal(state.preferences.displayName, 'Thayná Soares');
});

test('Correção 2: userAvatar gera iniciais elegantes quando avatarPreset é vazio', () => {
  const avatarEl = userAvatar({
    displayName: 'Thayná Soares',
    avatarPreset: '',
    avatar: '',
    emoji: ''
  });

  assert.ok(avatarEl.textContent.includes('TS'), 'Deve renderizar as iniciais TS para Thayná Soares');
  assert.equal(avatarEl.textContent.includes('👨🏻'), false, 'Não deve conter o emoji de homem com bigode');

  const singleNameAvatar = userAvatar({
    displayName: 'Thayná',
    avatarPreset: '',
    avatar: '',
    emoji: ''
  });
  assert.ok(singleNameAvatar.textContent.includes('TH'), 'Deve renderizar TH para Thayná');

  const womanAvatar = userAvatar({
    displayName: 'Thayná Soares',
    avatarPreset: 'woman-light',
    avatar: '',
    emoji: ''
  });
  assert.ok(womanAvatar.textContent.includes('👩🏻'), 'Deve respeitar o preset escolhido');
});

test('Correção 3: SyncManager dispara sincronização inicial no boot e transiciona para "synced"', async () => {
  const storage = createMockStorage({
    'finance-os:session:v1': JSON.stringify({
      access_token: 'valid-jwt',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'user-thayna', email: 'thayna@example.com' }
    })
  });

  let fetchCalled = false;
  const mockFetch = async (url) => {
    if (url.includes('/rest/v1/')) {
      fetchCalled = true;
      if (url.includes('profiles')) {
        return { ok: true, json: async () => [{ display_name: 'Thayná' }] };
      }
      return { ok: true, json: async () => [] };
    }
    throw new Error('Unexpected url: ' + url);
  };

  const client = new SupabaseClient({ storage, fetchFn: mockFetch });
  const store = createStore(storage, initialState(), client.getUser());
  const syncManager = new SyncManager(store, client, storage);

  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(fetchCalled, true, 'fetchUserState deve ter sido chamado no boot');
  assert.equal(syncManager.getStatus(), 'synced', 'Status deve transicionar para synced e não ficar preso em syncing');
});

test('Correção 4: Logout limpa a memória do store sem vazar dados entre sessões', async () => {
  const storage = createMockStorage();

  const mockFetch = async () => ({ ok: true, json: async () => [] });
  const client = new SupabaseClient({ storage, fetchFn: mockFetch });
  const store = createStore(storage, initialState());
  const syncManager = new SyncManager(store, client, storage);

  store.setUser({ id: 'user-pablo' });
  store.save({
    ...initialState(),
    accounts: [{ id: 'acc-priv', name: 'Conta Secreta Pablo', initialCents: 999999, color: '#112233' }]
  });

  assert.equal(store.getState().accounts.length, 1);
  assert.equal(store.getState().accounts[0].name, 'Conta Secreta Pablo');

  await syncManager.handleAuthChange(null);

  const loggedOutState = store.getState();
  assert.equal(loggedOutState.accounts.length, 0, 'Memória não pode reter contas do usuário após logout');
});

test('Correção 5: Supabase signUp converte "email rate limit exceeded" em mensagem amigável', async () => {
  const storage = createMockStorage();

  const mockFetch = async (url) => {
    if (url.includes('/auth/v1/signup')) {
      return {
        ok: false,
        status: 429,
        json: async () => ({ code: 429, msg: 'email rate limit exceeded' })
      };
    }
    throw new Error('Unexpected url');
  };

  const client = new SupabaseClient({ storage, fetchFn: mockFetch });

  await assert.rejects(
    async () => {
      await client.signUp({ email: 'patrick@example.com', password: 'password123', displayName: 'Patrick' });
    },
    /Limite temporário de envio de e-mails atingido/
  );
});

test('Correção 6: Supabase signInWithPassword trata "Email not confirmed" com orientação clara', async () => {
  const storage = createMockStorage();

  const mockFetch = async (url) => {
    if (url.includes('/auth/v1/token')) {
      return {
        ok: false,
        status: 400,
        json: async () => ({ error_description: 'Email not confirmed' })
      };
    }
    throw new Error('Unexpected url');
  };

  const client = new SupabaseClient({ storage, fetchFn: mockFetch });

  await assert.rejects(
    async () => {
      await client.signInWithPassword({ email: 'patrick@example.com', password: 'password123' });
    },
    /Seu e-mail ainda não foi confirmado/
  );
});
