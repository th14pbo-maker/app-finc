/**
 * Testes End-to-End contra Supabase Local Real (GoTrue + PostgREST + PostgreSQL)
 * Executado quando SUPABASE_LIVE_TEST=1.
 * Valida cadastro restrito, login, isolamento RLS, recuperação de senha e RPC atômica.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseClient } from '../app/js/supabase.mjs';

const isLive = process.env.SUPABASE_LIVE_TEST === '1';

test('Supabase Live E2E: Fluxo completo com Auth, PostgREST, RLS e recuperação real', { skip: !isLive }, async () => {
  let pg;
  try {
    const mod = await import('pg');
    pg = mod.default || mod;
  } catch {
    const mod = await import('../verification/node_modules/pg/lib/index.js');
    pg = mod.default || mod;
  }

  const dbUrl = (process.env.LOCAL_DATABASE_URL && process.env.LOCAL_DATABASE_URL !== 'null')
    ? process.env.LOCAL_DATABASE_URL
    : 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  const supabaseUrl = (process.env.SUPABASE_URL && process.env.SUPABASE_URL !== 'null')
    ? process.env.SUPABASE_URL
    : 'http://127.0.0.1:54321';
  const anonKey = (process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_ANON_KEY !== 'null')
    ? process.env.SUPABASE_ANON_KEY
    : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

  console.log(`[E2E] Conectando ao Postgres em ${dbUrl}...`);
  const pgClient = new pg.Client({ connectionString: dbUrl });
  await pgClient.connect();
  console.log(`[E2E] Conexão com Postgres estabelecida com sucesso.`);

  const emailA = `titular1-${Date.now()}@financeos.com`;
  const emailB = `titular2-${Date.now()}@financeos.com`;
  const passA = 'senha-segura-titular-1';
  const passB = 'senha-segura-titular-2';

  try {
    // 1. Preparação administrativa: Insere e-mails autorizados em public.allowed_emails
    console.log('[E2E 1/7] Inserindo convites autorizados em public.allowed_emails...');
    await pgClient.query('INSERT INTO public.allowed_emails (email, notes) VALUES ($1, $2), ($3, $4)', [
      emailA, 'Convidado 1 Teste E2E',
      emailB, 'Convidado 2 Teste E2E'
    ]);

    const clientA = new SupabaseClient({ config: { url: supabaseUrl, anonKey } });
    const clientB = new SupabaseClient({ config: { url: supabaseUrl, anonKey } });

    // 2. Teste de Cadastro Restrito: e-mail não autorizado deve ser rejeitado pela trigger do banco
    console.log('[E2E 2/7] Testando rejeição de cadastro não autorizado...');
    const emailIntruso = `intruso-${Date.now()}@desconhecido.com`;
    await assert.rejects(
      async () => {
        await clientA.signUp({
          email: emailIntruso,
          password: 'senha-qualquer-123',
          displayName: 'Intruso'
        });
      },
      /Acesso restrito/
    );
    console.log('[E2E 2/7] Rejeição de invasor validada com sucesso.');

    // 3. Cadastro Real dos e-mails autorizados
    console.log('[E2E 3/7] Cadastrando contas autorizadas A e B...');
    const regA = await clientA.signUp({ email: emailA, password: passA, displayName: 'Titular 1' });
    assert.ok(regA.user?.id, 'Conta A deve ter ID');

    const regB = await clientB.signUp({ email: emailB, password: passB, displayName: 'Titular 2' });
    assert.ok(regB.user?.id, 'Conta B deve ter ID');

    const uidA = regA.user.id;
    const uidB = regB.user.id;
    console.log(`[E2E 3/7] Contas criadas: uidA=${uidA}, uidB=${uidB}`);

    // 4. Login Real
    console.log('[E2E 4/7] Autenticando com credenciais reais...');
    const loginA = await clientA.signInWithPassword({ email: emailA, password: passA });
    assert.ok(loginA.session?.access_token, 'Login A deve retornar token JWT');

    const loginB = await clientB.signInWithPassword({ email: emailB, password: passB });
    assert.ok(loginB.session?.access_token, 'Login B deve retornar token JWT');

    // 5. Gravação e Isolamento RLS Real
    console.log('[E2E 5/7] Gravando dados e testando isolamento RLS cruzado...');
    // Conta A cria conta bancária e meta
    const accAId = crypto.randomUUID();
    await clientA.syncMutation('saveAccount', { id: accAId, name: 'Conta Titular 1 Real', initialCents: 500000, color: '#8a05be' });

    // Conta B cria conta bancária
    const accBId = crypto.randomUUID();
    await clientB.syncMutation('saveAccount', { id: accBId, name: 'Conta Titular 2 Real', initialCents: 200000, color: '#ec7000' });

    // Consulta de Conta A: só enxerga os dados de A
    const stateA = await clientA.fetchUserState();
    assert.equal(stateA.accounts.some(a => a.id === accAId), true);
    assert.equal(stateA.accounts.some(a => a.id === accBId), false, 'RLS vazou conta de B para A!');

    // Consulta de Conta B: só enxerga os dados de B
    const stateB = await clientB.fetchUserState();
    assert.equal(stateB.accounts.some(a => a.id === accBId), true);
    assert.equal(stateB.accounts.some(a => a.id === accAId), false, 'RLS vazou conta de A para B!');

    // Tentativa de invasão cruzada: B tenta excluir a conta de A
    await clientB.syncMutation('deleteAccount', accAId);
    // Verifica no banco nativo: conta de A continua existindo porque RLS filtrou o delete
    const checkA = await pgClient.query('SELECT name FROM public.accounts WHERE id = $1', [accAId]);
    assert.equal(checkA.rows.length, 1, 'RLS permitiu que B excluísse registro de A!');
    console.log('[E2E 5/7] Isolamento RLS entre contas 100% comprovado.');

    // 6. Teste Real da RPC import_user_state
    console.log('[E2E 6/7] Testando RPC atômica import_user_state...');
    const importRes = await clientA.rpc('import_user_state', {
      payload: {
        members: [{ id: 'me', name: 'Titular 1' }],
        accounts: [{ id: 'acc-imp-real', name: 'Conta Importada Real', initialCents: 1000, color: '#112233' }],
        cards: [],
        goals: [],
        contributions: [],
        transactions: [],
        preferences: { displayName: 'Titular 1', theme: 'dark', hideAmounts: false }
      },
      p_import_id: `e2e-import-${Date.now()}`
    });
    assert.equal(importRes.success, true);
    console.log('[E2E 6/7] RPC atômica executada com sucesso.');

    // 7. Teste de Recuperação e Atualização de Senha
    console.log('[E2E 7/7] Testando fluxo de recuperação e troca de senha...');
    await clientA.resetPasswordForEmail(emailA);

    // Atualiza a senha usando a sessão ativa
    const novaSenha = 'nova-senha-titular1-2026';
    await clientA.updateUser({ password: novaSenha });

    // Logout
    await clientA.signOut();

    // Senha antiga deve falhar
    await assert.rejects(
      async () => clientA.signInWithPassword({ email: emailA, password: passA }),
      /E-mail ou senha incorretos/
    );

    // Nova senha deve logar com sucesso
    const reLogin = await clientA.signInWithPassword({ email: emailA, password: novaSenha });
    assert.equal(reLogin.user?.email, emailA);

    console.log('PASS: Todos os fluxos reais de Auth, RLS, PostgREST e RPC validados com sucesso no Supabase local!');
  } finally {
    // Limpeza administrativa dos dados de teste
    try {
      await pgClient.query('DELETE FROM auth.users WHERE email IN ($1, $2)', [emailA, emailB]);
      await pgClient.query('DELETE FROM public.allowed_emails WHERE email IN ($1, $2)', [emailA, emailB]);
    } catch {}
    await pgClient.end();
  }
});
