-- ==============================================================================
-- FINANCE OS — TEST SUITE DE INTEGRAÇÃO (POSTGRESQL / SUPABASE)
-- Version: 20261025000000 (Revisão 3: Cenários com SET LOCAL ROLE e SQLSTATE)
-- Requirements: Ambiente Supabase Local (Docker + Supabase CLI) com auth.users e roles
-- ==============================================================================

\set ON_ERROR_STOP on

-- ==============================================================================
-- PREPARAÇÃO ADMINISTRATIVA (EXECUTADO COMO SUPERUSER / POSTGRES)
-- ==============================================================================
BEGIN;

DO $$
BEGIN
  RAISE NOTICE '--- PREPARAÇÃO ADMINISTRATIVA: Criando usuários de teste e convites ---';

  -- 2. Insere convite na lista de e-mails autorizados (allowed_emails)
  INSERT INTO public.allowed_emails (email, notes)
  VALUES 
    ('titular1@financeos.com', 'Convidado de teste 1'),
    ('titular2@financeos.com', 'Convidado de teste 2')
  ON CONFLICT (email) DO NOTHING;
  -- 1. Garante a existência dos usuários no schema auth para teste
  INSERT INTO auth.users (id, email, raw_user_meta_data, role, aud)
  VALUES 
    ('11111111-1111-1111-1111-111111111111', 'titular1@financeos.com', '{"displayName":"Usuário 1"}'::jsonb, 'authenticated', 'authenticated'),
    ('22222222-2222-2222-2222-222222222222', 'titular2@financeos.com', '{"displayName":"Usuário 2"}'::jsonb, 'authenticated', 'authenticated')
  ON CONFLICT (id) DO NOTHING;


END;
$$;

COMMIT;

-- ==============================================================================
-- CENÁRIO 1: Bloqueio de Leitura de allowed_emails para anon e authenticated
-- ==============================================================================
BEGIN;

DO $$
DECLARE
  v_sqlstate TEXT;
  v_errmsg TEXT;
  v_rec RECORD;
BEGIN
  RAISE NOTICE '[CENÁRIO 1] Testando negação de acesso a allowed_emails via SET LOCAL ROLE...';

  -- 1a. Teste com role anon
  SET LOCAL ROLE anon;
  BEGIN
    SELECT * INTO v_rec FROM public.allowed_emails LIMIT 1;
    RAISE EXCEPTION 'TESTE FALHOU: role anon conseguiu ler public.allowed_emails!';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
    IF v_sqlstate <> '42501' THEN
      RAISE EXCEPTION 'TESTE FALHOU (anon): erro esperado era 42501 (insufficient_privilege), recebido % (%)', v_sqlstate, v_errmsg;
    END IF;
  END;

  -- 1b. Teste com role authenticated
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  BEGIN
    SELECT * INTO v_rec FROM public.allowed_emails LIMIT 1;
    RAISE EXCEPTION 'TESTE FALHOU: role authenticated conseguiu ler public.allowed_emails!';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
    IF v_sqlstate <> '42501' THEN
      RAISE EXCEPTION 'TESTE FALHOU (authenticated): erro esperado era 42501 (insufficient_privilege), recebido % (%)', v_sqlstate, v_errmsg;
    END IF;
  END;

  RESET ROLE;
  RAISE NOTICE '[CENÁRIO 1 APROVADO] Acesso negado com 42501 tanto para anon quanto authenticated.';
END;
$$;

ROLLBACK;

-- ==============================================================================
-- CENÁRIO 2: Importação Completa e Conferência de Quantidades e Valores
-- ==============================================================================
BEGIN;

DO $$
DECLARE
  v_user_1 UUID := '11111111-1111-1111-1111-111111111111';
  v_payload JSONB;
  v_res JSONB;
  v_count INT;
  v_sum BIGINT;
BEGIN
  RAISE NOTICE '[CENÁRIO 2] Testando importação completa como role authenticated...';

  -- Simula exatamente o contexto do PostgREST
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_1::text, true);

  -- Confirma role efetiva e contexto de auth
  IF current_user <> 'authenticated' OR auth.uid() <> v_user_1 THEN
    RAISE EXCEPTION 'TESTE FALHOU: contexto de execução incorreto: current_user=%, auth.uid=%', current_user, auth.uid();
  END IF;

  v_payload := jsonb_build_object(
    'members', jsonb_build_array(
      jsonb_build_object('id', 'me', 'name', 'Você')
    ),
    'accounts', jsonb_build_array(
      jsonb_build_object('id', 'acc-nu', 'name', 'Nubank', 'initialCents', 50000, 'color', '#8a05be'),
      jsonb_build_object('id', 'acc-it', 'name', 'Itaú', 'initialCents', 120000, 'color', '#ec7000')
    ),
    'cards', jsonb_build_array(
      jsonb_build_object('id', 'card-roxo', 'name', 'Cartão Nubank', 'limitCents', 300000, 'color', '#8a05be', 'closingDay', 10, 'dueDay', 20)
    ),
    'goals', jsonb_build_array(
      jsonb_build_object('id', 'goal-car', 'name', 'Carro 2027', 'kind', 'car', 'targetCents', 7000000, 'initialCents', 0, 'targetDate', '2027-10-01')
    ),
    'contributions', jsonb_build_array(
      jsonb_build_object('id', 'cont-1', 'goalId', 'goal-car', 'date', '2026-10-25', 'amountCents', 1000000)
    ),
    'transactions', jsonb_build_array(
      jsonb_build_object('id', 'tx-1', 'description', 'Salário', 'type', 'income', 'amountCents', 500000, 'date', '2026-10-05', 'accountId', 'acc-nu', 'category', 'Salário', 'memberId', 'me'),
      jsonb_build_object('id', 'tx-2', 'description', 'Compra no mercado', 'type', 'cardPurchase', 'amountCents', 35000, 'date', '2026-10-10', 'cardId', 'card-roxo', 'category', 'Mercado', 'memberId', 'me'),
      jsonb_build_object('id', 'tx-3', 'description', 'Pagamento fatura', 'type', 'cardPayment', 'amountCents', 35000, 'date', '2026-10-20', 'accountId', 'acc-nu', 'cardId', 'card-roxo', 'invoiceMonth', '2026-10', 'category', 'Outros', 'memberId', 'me')
    ),
    'preferences', jsonb_build_object(
      'displayName', 'Pablo',
      'theme', 'dark',
      'hideAmounts', false
    )
  );

  v_res := public.import_user_state(v_payload, 'import-run-001');

  IF (v_res->>'success')::BOOLEAN <> true THEN
    RAISE EXCEPTION 'TESTE FALHOU: importação não indicou sucesso.';
  END IF;

  -- Conferência de contagens
  IF (v_res->'counts'->>'transactions')::INT <> 3 OR
     (v_res->'counts'->>'accounts')::INT <> 2 OR
     (v_res->'counts'->>'cards')::INT <> 1 OR
     (v_res->'counts'->>'goals')::INT <> 1 OR
     (v_res->'counts'->>'contributions')::INT <> 1 OR
     (v_res->'counts'->>'members')::INT <> 1 THEN
    RAISE EXCEPTION 'TESTE FALHOU: contagens retornadas não batem com o payload.';
  END IF;

  -- Conferência de registros físicos gravados no banco
  SELECT COUNT(*) INTO v_count FROM public.transactions WHERE user_id = v_user_1;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'TESTE FALHOU: total físico de transações esperado 3, encontrado %', v_count;
  END IF;

  -- Conferência dos valores acumulados
  SELECT SUM(amount_cents) INTO v_sum FROM public.transactions WHERE user_id = v_user_1;
  IF v_sum <> 570000 THEN
    RAISE EXCEPTION 'TESTE FALHOU: soma de transações esperada: 570000 centavos, encontrada: %', v_sum;
  END IF;

  SELECT SUM(initial_cents) INTO v_sum FROM public.accounts WHERE user_id = v_user_1;
  IF v_sum <> 170000 THEN
    RAISE EXCEPTION 'TESTE FALHOU: soma de saldos iniciais esperada: 170000 centavos, encontrada: %', v_sum;
  END IF;

  -- ============================================================================
  -- CENÁRIO 3: Repetição após Timeout (Idempotência sem duplicação de dados)
  -- ============================================================================
  RAISE NOTICE '[CENÁRIO 3] Testando repetição após timeout com mesmo import_id...';
  v_res := public.import_user_state(v_payload, 'import-run-001');

  IF (v_res->>'success')::BOOLEAN <> true THEN
    RAISE EXCEPTION 'TESTE FALHOU: repetição idempotente deveria devolver sucesso.';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.transactions WHERE user_id = v_user_1;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'TESTE FALHOU: repetição idempotente duplicou dados! Contagem: %', v_count;
  END IF;

  RESET ROLE;
  RAISE NOTICE '[CENÁRIOS 2 E 3 APROVADOS] Importação e idempotência validadas com sucesso.';
END;
$$;

ROLLBACK;

-- ==============================================================================
-- CENÁRIO 4: Payload com Coleção de Tipo Incorreto (Rejeição Estrita)
-- ==============================================================================
BEGIN;

DO $$
DECLARE
  v_user_2 UUID := '22222222-2222-2222-2222-222222222222';
  v_sqlstate TEXT;
  v_errmsg TEXT;
BEGIN
  RAISE NOTICE '[CENÁRIO 4] Testando rejeição de payload com coleção malformada...';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_2::text, true);

  BEGIN
    -- 'members' passado como objeto JSON em vez de array
    PERFORM public.import_user_state(
      jsonb_build_object(
        'members', jsonb_build_object('id', 'me'),
        'accounts', '[]'::jsonb,
        'cards', '[]'::jsonb,
        'goals', '[]'::jsonb,
        'contributions', '[]'::jsonb,
        'transactions', '[]'::jsonb,
        'preferences', jsonb_build_object('displayName', 'User 2')
      ),
      'import-u2-malformed'
    );
    RAISE EXCEPTION 'TESTE FALHOU: coleção de tipo incorreto não foi rejeitada!';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
    IF v_sqlstate <> 'P0001' OR v_errmsg NOT LIKE '%não é um array JSON%' THEN
      RAISE EXCEPTION 'TESTE FALHOU: esperado erro P0001 com mensagem de array JSON, recebido % (%)', v_sqlstate, v_errmsg;
    END IF;
  END;

  RESET ROLE;
  RAISE NOTICE '[CENÁRIO 4 APROVADO] Coleção não-array rejeitada com SQLSTATE P0001.';
END;
$$;

ROLLBACK;

-- ==============================================================================
-- CENÁRIO 5: Referências Inexistentes e IDs Duplicados
-- ==============================================================================
BEGIN;

DO $$
DECLARE
  v_user_2 UUID := '22222222-2222-2222-2222-222222222222';
  v_sqlstate TEXT;
  v_errmsg TEXT;
BEGIN
  RAISE NOTICE '[CENÁRIO 5] Testando rejeição de referências inexistentes e IDs duplicados...';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_2::text, true);

  -- 5a. Transação com accountId fantasma
  BEGIN
    PERFORM public.import_user_state(
      jsonb_build_object(
        'members', jsonb_build_array(jsonb_build_object('id', 'me', 'name', 'Você')),
        'accounts', '[]'::jsonb,
        'cards', '[]'::jsonb,
        'goals', '[]'::jsonb,
        'contributions', '[]'::jsonb,
        'transactions', jsonb_build_array(
          jsonb_build_object('id', 'tx-1', 'description', 'Sem conta', 'type', 'income', 'amountCents', 1000, 'date', '2026-10-01', 'accountId', 'conta-fantasma', 'category', 'Outros', 'memberId', 'me')
        ),
        'preferences', jsonb_build_object('displayName', 'User 2')
      ),
      'import-ghost-acc'
    );
    RAISE EXCEPTION 'TESTE FALHOU: accountId inexistente não gerou erro!';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
    IF v_sqlstate <> 'P0001' OR v_errmsg NOT LIKE '%referencia accountId inexistente%' THEN
      RAISE EXCEPTION 'TESTE FALHOU: esperado erro P0001 de accountId inexistente, recebido % (%)', v_sqlstate, v_errmsg;
    END IF;
  END;

  -- 5b. Transação com memberId fantasma informado
  BEGIN
    PERFORM public.import_user_state(
      jsonb_build_object(
        'members', jsonb_build_array(jsonb_build_object('id', 'me', 'name', 'Você')),
        'accounts', jsonb_build_array(jsonb_build_object('id', 'acc-1', 'name', 'Conta', 'initialCents', 0, 'color', '#112233')),
        'cards', '[]'::jsonb,
        'goals', '[]'::jsonb,
        'contributions', '[]'::jsonb,
        'transactions', jsonb_build_array(
          jsonb_build_object('id', 'tx-1', 'description', 'Sem membro', 'type', 'income', 'amountCents', 1000, 'date', '2026-10-01', 'accountId', 'acc-1', 'category', 'Outros', 'memberId', 'membro-fantasma')
        ),
        'preferences', jsonb_build_object('displayName', 'User 2')
      ),
      'import-ghost-mem'
    );
    RAISE EXCEPTION 'TESTE FALHOU: memberId informado inexistente não gerou erro!';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
    IF v_sqlstate <> 'P0001' OR v_errmsg NOT LIKE '%referencia memberId inexistente%' THEN
      RAISE EXCEPTION 'TESTE FALHOU: esperado erro P0001 de memberId inexistente, recebido % (%)', v_sqlstate, v_errmsg;
    END IF;
  END;

  -- 5c. Aporte com goalId fantasma
  BEGIN
    PERFORM public.import_user_state(
      jsonb_build_object(
        'members', jsonb_build_array(jsonb_build_object('id', 'me', 'name', 'Você')),
        'accounts', '[]'::jsonb,
        'cards', '[]'::jsonb,
        'goals', '[]'::jsonb,
        'contributions', jsonb_build_array(
          jsonb_build_object('id', 'c-1', 'goalId', 'meta-fantasma', 'date', '2026-10-25', 'amountCents', 50000)
        ),
        'transactions', '[]'::jsonb,
        'preferences', jsonb_build_object('displayName', 'User 2')
      ),
      'import-ghost-goal'
    );
    RAISE EXCEPTION 'TESTE FALHOU: goalId inexistente não gerou erro!';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
    IF v_sqlstate <> 'P0001' OR v_errmsg NOT LIKE '%referencia goalId inexistente%' THEN
      RAISE EXCEPTION 'TESTE FALHOU: esperado erro P0001 de goalId inexistente, recebido % (%)', v_sqlstate, v_errmsg;
    END IF;
  END;

  -- 5d. IDs duplicados em contas
  BEGIN
    PERFORM public.import_user_state(
      jsonb_build_object(
        'members', jsonb_build_array(jsonb_build_object('id', 'me', 'name', 'Você')),
        'accounts', jsonb_build_array(
          jsonb_build_object('id', 'acc-dup', 'name', 'Conta 1', 'initialCents', 100, 'color', '#112233'),
          jsonb_build_object('id', 'acc-dup', 'name', 'Conta 2', 'initialCents', 200, 'color', '#445566')
        ),
        'cards', '[]'::jsonb,
        'goals', '[]'::jsonb,
        'contributions', '[]'::jsonb,
        'transactions', '[]'::jsonb,
        'preferences', jsonb_build_object('displayName', 'User 2')
      ),
      'import-dup-acc'
    );
    RAISE EXCEPTION 'TESTE FALHOU: IDs duplicados em contas não geraram erro!';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
    IF v_sqlstate <> 'P0001' OR v_errmsg NOT LIKE '%ID duplicado%' THEN
      RAISE EXCEPTION 'TESTE FALHOU: esperado erro P0001 de ID duplicado, recebido % (%)', v_sqlstate, v_errmsg;
    END IF;
  END;

  -- 5e. IDs duplicados em transações
  BEGIN
    PERFORM public.import_user_state(
      jsonb_build_object(
        'members', jsonb_build_array(jsonb_build_object('id', 'me', 'name', 'Você')),
        'accounts', jsonb_build_array(jsonb_build_object('id', 'acc-1', 'name', 'Conta 1', 'initialCents', 100, 'color', '#112233')),
        'cards', '[]'::jsonb,
        'goals', '[]'::jsonb,
        'contributions', '[]'::jsonb,
        'transactions', jsonb_build_array(
          jsonb_build_object('id', 'tx-dup', 'description', 'Tx 1', 'type', 'income', 'amountCents', 1000, 'date', '2026-10-01', 'accountId', 'acc-1', 'category', 'Outros', 'memberId', 'me'),
          jsonb_build_object('id', 'tx-dup', 'description', 'Tx 2', 'type', 'income', 'amountCents', 2000, 'date', '2026-10-02', 'accountId', 'acc-1', 'category', 'Outros', 'memberId', 'me')
        ),
        'preferences', jsonb_build_object('displayName', 'User 2')
      ),
      'import-dup-tx'
    );
    RAISE EXCEPTION 'TESTE FALHOU: IDs duplicados em transações não geraram erro!';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
    IF v_sqlstate <> 'P0001' OR v_errmsg NOT LIKE '%ID duplicado%' THEN
      RAISE EXCEPTION 'TESTE FALHOU: esperado erro P0001 de ID duplicado em transações, recebido % (%)', v_sqlstate, v_errmsg;
    END IF;
  END;

  IF EXISTS (SELECT 1 FROM public.members) OR EXISTS (SELECT 1 FROM public.accounts)
     OR EXISTS (SELECT 1 FROM public.transactions) OR EXISTS (SELECT 1 FROM public.import_logs)
     OR EXISTS (SELECT 1 FROM public.cards) OR EXISTS (SELECT 1 FROM public.goals)
     OR EXISTS (SELECT 1 FROM public.contributions) THEN
    RAISE EXCEPTION 'Rollback da RPC deixou dados parciais antes do rollback externo';
  END IF;
  RESET ROLE;
  RAISE NOTICE '[CENÁRIO 5 APROVADO] Todas as validações relacionais e de duplicidade foram validadas via SQLSTATE.';
END;
$$;

ROLLBACK;

-- ==============================================================================
-- CENÁRIO 6: RLS com dados presentes e tentativa de referência cruzada
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
INSERT INTO public.members(id,user_id,name) VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc',auth.uid(),'A');
INSERT INTO public.accounts(id,user_id,name,initial_cents,color)
VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',auth.uid(),'Conta A',100,'#112233');
INSERT INTO public.transactions(id,user_id,description,type,amount_cents,date,account_id,category,member_id)
VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',auth.uid(),'Receita A','income',100,'2026-10-25','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Teste','cccccccc-cccc-4ccc-8ccc-cccccccccccc');
DO $$ BEGIN
 IF (SELECT count(*) FROM public.accounts) <> 1 OR (SELECT count(*) FROM public.transactions) <> 1 THEN
 RAISE EXCEPTION 'Usuário A deve enxergar seus dados antes do teste de B'; END IF;
END $$;
SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
INSERT INTO public.members(id,user_id,name) VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd',auth.uid(),'B');
DO $$ DECLARE n int; BEGIN
 IF (SELECT count(*) FROM public.accounts) <> 0 OR (SELECT count(*) FROM public.transactions) <> 0 THEN
 RAISE EXCEPTION 'RLS vazou dados de A para B'; END IF;
 BEGIN
 INSERT INTO public.transactions(user_id,description,type,amount_cents,date,account_id,category,member_id)
 VALUES(auth.uid(),'Ataque','income',10,'2026-10-25','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Teste','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
 RAISE EXCEPTION 'Referência cruzada aceita';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.accounts SET name='Alterado' WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 0 THEN RAISE EXCEPTION 'B alterou conta A'; END IF;
 DELETE FROM public.transactions WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 0 THEN RAISE EXCEPTION 'B apagou transação A'; END IF;
END $$;
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
DO $$ BEGIN
 IF (SELECT name FROM public.accounts LIMIT 1) <> 'Conta A' OR (SELECT count(*) FROM public.transactions) <> 1 THEN
 RAISE EXCEPTION 'Dados de A foram modificados'; END IF;
 RAISE NOTICE '[CENÁRIO 6 APROVADO] Leitura, alteração, exclusão e referência cruzada';
END $$;
ROLLBACK;

-- ==============================================================================
-- CENÁRIO 7: Impossibilidade de Falsificar import_logs pela API (Privilégios Reais)
-- ==============================================================================
BEGIN;

DO $$
DECLARE
  v_user_2 UUID := '22222222-2222-2222-2222-222222222222';
  v_sqlstate TEXT;
  v_errmsg TEXT;
BEGIN
  RAISE NOTICE '[CENÁRIO 7] Testando impossibilidade de alterar import_logs como cliente autenticado...';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_2::text, true);

  -- 7a. Tentativa de INSERT direto na tabela import_logs
  BEGIN
    INSERT INTO public.import_logs (user_id, import_id, content_hash, status)
    VALUES (v_user_2, 'fake-import-direct', '0000000000000000000000000000000000000000000000000000000000000000', 'completed');
    RAISE EXCEPTION 'TESTE FALHOU: cliente authenticated conseguiu fazer INSERT direto em import_logs!';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
    IF v_sqlstate <> '42501' THEN
      RAISE EXCEPTION 'TESTE FALHOU: erro esperado era 42501 (insufficient_privilege), recebido % (%)', v_sqlstate, v_errmsg;
    END IF;
  END;

  -- 7b. Tentativa de UPDATE direto na tabela import_logs
  BEGIN
    UPDATE public.import_logs SET status = 'completed' WHERE user_id = v_user_2;
    RAISE EXCEPTION 'TESTE FALHOU: cliente authenticated conseguiu fazer UPDATE direto em import_logs!';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
    IF v_sqlstate <> '42501' THEN
      RAISE EXCEPTION 'TESTE FALHOU: erro esperado era 42501 (insufficient_privilege), recebido % (%)', v_sqlstate, v_errmsg;
    END IF;
  END;

  -- 7c. Tentativa de DELETE direto na tabela import_logs
  BEGIN
    DELETE FROM public.import_logs WHERE user_id = v_user_2;
    RAISE EXCEPTION 'TESTE FALHOU: cliente authenticated conseguiu fazer DELETE direto em import_logs!';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
    IF v_sqlstate <> '42501' THEN
      RAISE EXCEPTION 'TESTE FALHOU: erro esperado era 42501 (insufficient_privilege), recebido % (%)', v_sqlstate, v_errmsg;
    END IF;
  END;

  RESET ROLE;
  RAISE NOTICE '[CENÁRIO 7 APROVADO] Privilégios reais em import_logs bloqueiam INSERT, UPDATE e DELETE com 42501.';
END;
$$;

ROLLBACK;



-- CENÁRIO 8: objeto temporário do chamador não pode ser usado pela RPC privilegiada.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
CREATE TEMP TABLE temp_id_map(marker text) ON COMMIT DROP;
INSERT INTO temp_id_map VALUES ('nao alterar');
DO $$ DECLARE r jsonb; BEGIN
 r := public.import_user_state('{"members":[],"accounts":[],"cards":[],"goals":[],"contributions":[],"transactions":[],"preferences":{"displayName":"Você"}}'::jsonb,'poison-regression');
 IF r->>'success' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Importação falhou'; END IF;
 IF (SELECT marker FROM pg_temp.temp_id_map) IS DISTINCT FROM 'nao alterar' THEN
 RAISE EXCEPTION 'RPC tocou objeto temporário do chamador'; END IF;
 RAISE NOTICE '[CENÁRIO 8 APROVADO] Objeto temporário do chamador ignorado';
END $$;
ROLLBACK;

-- Limpeza somente dos fixtures criados nesta suíte em banco descartável.
BEGIN;
DELETE FROM auth.users WHERE id IN ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
DELETE FROM public.allowed_emails WHERE email IN ('titular1@financeos.com','titular2@financeos.com');
COMMIT;
DO $$ BEGIN RAISE NOTICE 'SUITE SQL CONCLUÍDA: 8 cenários'; END $$;
