import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseClient } from '../app/js/supabase.mjs';

function createMockStorage() {
  const map = new Map();
  return {
    getItem: k => map.get(k) || null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    clear: () => map.clear()
  };
}

test('Supabase Auth: Cadastro direto de usuário com e-mail, senha e metadados', async () => {
  const storage = createMockStorage();

  // Mock fetch simulating GoTrue registration
  const mockFetch = async (url, options) => {
    if (url.includes('/auth/v1/signup')) {
      const body = JSON.parse(options.body);
      if (body.email === 'ja-existe@example.com') {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            code: 400,
            msg: 'User already registered'
          })
        };
      }
      // Direct registration succeeds
      return {
        ok: true,
        status: 200,
        json: async () => ({
          user: { id: '11111111-1111-1111-1111-111111111111', email: body.email, user_metadata: body.data },
          session: {
            access_token: 'fake-jwt-token-titular1',
            token_type: 'bearer',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: { id: '11111111-1111-1111-1111-111111111111', email: body.email }
          }
        })
      };
    }
    throw new Error(`Unhandled mock url: ${url}`);
  };

  const client = new SupabaseClient({ storage, fetchFn: mockFetch });

  // 1. Tentar cadastro com e-mail duplicado deve informar erro amigável
  await assert.rejects(
    async () => {
      await client.signUp({
        email: 'ja-existe@example.com',
        password: 'password123',
        displayName: 'Existente'
      });
    },
    /Este e-mail já possui cadastro/
  );

  // 2. Cadastro direto de novo usuário conclui com sucesso
  const res = await client.signUp({
    email: 'novo-usuario@financeos.com',
    password: 'password123',
    displayName: 'Novo Usuário'
  });

  assert.equal(res.user.email, 'novo-usuario@financeos.com');
  assert.equal(res.session.access_token, 'fake-jwt-token-titular1');
  assert.equal(client.getUser()?.email, 'novo-usuario@financeos.com');
});

test('Supabase Auth: Login, falha de senha incorreta, recuperação e logout', async () => {
  const storage = createMockStorage();

  const mockFetch = async (url, options) => {
    if (url.includes('/auth/v1/token?grant_type=password')) {
      const body = JSON.parse(options.body);
      if (body.password !== 'senha-correta') {
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
          access_token: 'valid-jwt-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: 'user-abc', email: body.email }
        })
      };
    }

    if (url.includes('/auth/v1/recover')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({})
      };
    }

    if (url.includes('/auth/v1/logout')) {
      return {
        ok: true,
        status: 204,
        json: async () => ({})
      };
    }

    throw new Error(`Unhandled URL: ${url}`);
  };

  const client = new SupabaseClient({ storage, fetchFn: mockFetch });

  // 1. Senha errada
  await assert.rejects(
    async () => {
      await client.signInWithPassword({ email: 'titular1@financeos.com', password: 'senha-errada' });
    },
    /E-mail ou senha incorretos/
  );

  // 2. Senha correta
  const loginRes = await client.signInWithPassword({ email: 'titular1@financeos.com', password: 'senha-correta' });
  assert.equal(loginRes.user.email, 'titular1@financeos.com');
  assert.equal(client.getUser()?.id, 'user-abc');

  // 3. Recuperação de senha
  const recoverRes = await client.resetPasswordForEmail('titular1@financeos.com');
  assert.equal(recoverRes.ok, true);

  // 4. Logout
  const logoutRes = await client.signOut();
  assert.equal(logoutRes.ok, true);
  assert.equal(client.getUser(), null);
  assert.equal(storage.getItem('finance-os:session:v1'), null);
});
