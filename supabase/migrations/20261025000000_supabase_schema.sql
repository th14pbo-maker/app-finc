-- ==============================================================================
-- FINANCE OS — SUPABASE SCHEMA & SECURITY MIGRATION
-- Version: 20261025000000 (Revisão 3: Privilégios Reais, Isolamento e Resiliência)
-- Description: Core tables, constraints, granular RLS, atomic & idempotent import RPC
-- ==============================================================================

-- 0. EXTENSÕES E PERMISSÕES DE BASE
-- pgcrypto instalada no schema extensions (padrão Supabase)
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
DO $$ BEGIN
 IF (SELECT n.nspname FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto') <> 'extensions' THEN
  RAISE EXCEPTION 'pgcrypto deve estar em extensions; ajuste explicitamente o ambiente antes da migração.';
 END IF;
END $$;

-- Remapeamento usa somente variáveis locais; a RPC não exige TEMP.

-- Permissões de uso de schemas
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated;

-- ==============================================================================
-- 1. TABELA DE CONVIDADOS / WHITELIST FAMILIAR (PRIVACIDADE TOTAL)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.allowed_emails (
  email TEXT PRIMARY KEY,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;

-- Limpeza explícita de qualquer política antiga se existente
DROP POLICY IF EXISTS "Leitura de emails autorizados apenas para checagem" ON public.allowed_emails;
DROP POLICY IF EXISTS "allowed_emails_select" ON public.allowed_emails;
DROP POLICY IF EXISTS "allowed_emails_public_read" ON public.allowed_emails;

-- Revoga explicitamente privilégios de clientes da API (anon e authenticated)
-- A lista de emails autorizados e anotações NUNCA é consultável via API cliente
REVOKE ALL ON TABLE public.allowed_emails FROM public, anon, authenticated;
GRANT ALL ON TABLE public.allowed_emails TO service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT ALL ON TABLE public.allowed_emails TO supabase_auth_admin;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    GRANT ALL ON TABLE public.allowed_emails TO postgres;
  END IF;
END;
$$;

-- Trigger SECURITY DEFINER com search_path sanitizado para validar novos cadastros
CREATE OR REPLACE FUNCTION public.check_user_registration_allowed()
RETURNS trigger
SECURITY DEFINER
SET search_path = pg_catalog, extensions, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.allowed_emails
    WHERE LOWER(email) = LOWER(NEW.email)
  ) THEN
    RAISE EXCEPTION 'Cadastro não autorizado. O Finance OS é restrito a convidados e familiares autorizados.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_user_registration_allowed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_user_registration_allowed() TO service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT EXECUTE ON FUNCTION public.check_user_registration_allowed() TO supabase_auth_admin;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    GRANT EXECUTE ON FUNCTION public.check_user_registration_allowed() TO postgres;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_whitelist ON auth.users;
CREATE TRIGGER on_auth_user_created_whitelist
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.check_user_registration_allowed();

-- ==============================================================================
-- 2. TABELA DE PERFIL E PREFERÊNCIAS (PROFILES)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT DEFAULT 'Você' NOT NULL CHECK (char_length(trim(display_name)) > 0 AND char_length(display_name) <= 60),
  theme TEXT DEFAULT 'dark' NOT NULL CHECK (theme IN ('light', 'dark')),
  hide_amounts BOOLEAN DEFAULT FALSE NOT NULL,
  avatar_preset TEXT,
  avatar_emoji TEXT,
  avatar_data TEXT,
  flow_chart_type TEXT DEFAULT 'line' CHECK (flow_chart_type IN ('line', 'bar', 'pie')),
  version INT DEFAULT 1 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.profiles FROM anon, public, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
SECURITY DEFINER
SET search_path = pg_catalog, extensions, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'displayName', 'Você'))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user_profile() TO service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT ALL ON TABLE public.profiles TO supabase_auth_admin;
    GRANT EXECUTE ON FUNCTION public.handle_new_user_profile() TO supabase_auth_admin;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    GRANT ALL ON TABLE public.profiles TO postgres;
    GRANT EXECUTE ON FUNCTION public.handle_new_user_profile() TO postgres;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- ==============================================================================
-- 3. TABELA DE CONTAS (ACCOUNTS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 80),
  initial_cents BIGINT NOT NULL CHECK (initial_cents >= -1000000000000 AND initial_cents <= 1000000000000),
  color TEXT NOT NULL CHECK (color ~* '^#[0-9a-f]{6}$'),
  version INT DEFAULT 1 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accounts_select" ON public.accounts;
DROP POLICY IF EXISTS "accounts_insert" ON public.accounts;
DROP POLICY IF EXISTS "accounts_update" ON public.accounts;
DROP POLICY IF EXISTS "accounts_delete" ON public.accounts;

CREATE POLICY "accounts_select" ON public.accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "accounts_insert" ON public.accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "accounts_update" ON public.accounts FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "accounts_delete" ON public.accounts FOR DELETE USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.accounts FROM anon, public, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accounts TO authenticated;
GRANT ALL ON TABLE public.accounts TO service_role;

CREATE INDEX IF NOT EXISTS idx_accounts_user ON public.accounts (user_id);

-- ==============================================================================
-- 4. TABELA DE CARTÕES DE CRÉDITO (CARDS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.cards (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 80),
  limit_cents BIGINT NOT NULL CHECK (limit_cents > 0 AND limit_cents <= 1000000000000),
  color TEXT NOT NULL CHECK (color ~* '^#[0-9a-f]{6}$'),
  closing_day SMALLINT NOT NULL CHECK (closing_day >= 1 AND closing_day <= 31),
  due_day SMALLINT NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
  version INT DEFAULT 1 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cards_select" ON public.cards;
DROP POLICY IF EXISTS "cards_insert" ON public.cards;
DROP POLICY IF EXISTS "cards_update" ON public.cards;
DROP POLICY IF EXISTS "cards_delete" ON public.cards;

CREATE POLICY "cards_select" ON public.cards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cards_insert" ON public.cards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cards_update" ON public.cards FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cards_delete" ON public.cards FOR DELETE USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.cards FROM anon, public, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cards TO authenticated;
GRANT ALL ON TABLE public.cards TO service_role;

CREATE INDEX IF NOT EXISTS idx_cards_user ON public.cards (user_id);

-- ==============================================================================
-- 5. TABELA DE METAS FINANCEIRAS (GOALS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.goals (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 80),
  kind TEXT NOT NULL CHECK (kind IN ('general', 'car', 'home')),
  target_cents BIGINT NOT NULL CHECK (target_cents > 0 AND target_cents <= 1000000000000),
  initial_cents BIGINT NOT NULL DEFAULT 0 CHECK (initial_cents >= 0 AND initial_cents <= 1000000000000),
  target_date DATE NOT NULL,
  version INT DEFAULT 1 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "goals_select" ON public.goals;
DROP POLICY IF EXISTS "goals_insert" ON public.goals;
DROP POLICY IF EXISTS "goals_update" ON public.goals;
DROP POLICY IF EXISTS "goals_delete" ON public.goals;

CREATE POLICY "goals_select" ON public.goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "goals_insert" ON public.goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "goals_update" ON public.goals FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "goals_delete" ON public.goals FOR DELETE USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.goals FROM anon, public, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.goals TO authenticated;
GRANT ALL ON TABLE public.goals TO service_role;

CREATE INDEX IF NOT EXISTS idx_goals_user ON public.goals (user_id);

-- ==============================================================================
-- 6. TABELA DE APORTES (CONTRIBUTIONS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.contributions (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 1000000000000),
  version INT DEFAULT 1 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contributions_select" ON public.contributions;
DROP POLICY IF EXISTS "contributions_insert" ON public.contributions;
DROP POLICY IF EXISTS "contributions_update" ON public.contributions;
DROP POLICY IF EXISTS "contributions_delete" ON public.contributions;

CREATE POLICY "contributions_select" ON public.contributions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "contributions_insert" ON public.contributions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.goals g WHERE g.id = contributions.goal_id AND g.user_id = auth.uid())
  );

CREATE POLICY "contributions_update" ON public.contributions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.goals g WHERE g.id = contributions.goal_id AND g.user_id = auth.uid())
  );

CREATE POLICY "contributions_delete" ON public.contributions FOR DELETE USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.contributions FROM anon, public, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contributions TO authenticated;
GRANT ALL ON TABLE public.contributions TO service_role;

CREATE INDEX IF NOT EXISTS idx_contributions_user_date ON public.contributions (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_contributions_goal ON public.contributions (goal_id);

-- ==============================================================================
-- 7. TABELA DE MEMBROS (MEMBERS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.members (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 60),
  version INT DEFAULT 1 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_select" ON public.members;
DROP POLICY IF EXISTS "members_insert" ON public.members;
DROP POLICY IF EXISTS "members_update" ON public.members;
DROP POLICY IF EXISTS "members_delete" ON public.members;

CREATE POLICY "members_select" ON public.members FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "members_insert" ON public.members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "members_update" ON public.members FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "members_delete" ON public.members FOR DELETE USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.members FROM anon, public, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.members TO authenticated;
GRANT ALL ON TABLE public.members TO service_role;

CREATE INDEX IF NOT EXISTS idx_members_user ON public.members (user_id);

-- ==============================================================================
-- 8. TABELA DE TRANSAÇÕES (TRANSACTIONS) COM INVARIANTES E RLS ESTRITO
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL CHECK (char_length(trim(description)) > 0 AND char_length(description) <= 140),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 2000),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer', 'cardPurchase', 'cardPayment')),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 1000000000000),
  date DATE NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  to_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  card_id UUID REFERENCES public.cards(id) ON DELETE RESTRICT,
  invoice_month TEXT,
  category TEXT NOT NULL CHECK (char_length(category) <= 80),
  tags TEXT[] DEFAULT '{}' NOT NULL,
  priority TEXT CHECK (priority IS NULL OR priority IN ('essential', 'non_essential', 'wellbeing', 'extra', 'unclassified')),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  version INT DEFAULT 1 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Invariantes rigorosas por tipo de lançamento (espelho fiel de domain.mjs)
  CONSTRAINT chk_transaction_type_invariants CHECK (
    -- 1. Receita e Despesa: exigem conta e proíbem conta de destino e mês de fatura
    (type IN ('income', 'expense') AND account_id IS NOT NULL AND to_account_id IS NULL AND card_id IS NULL AND invoice_month IS NULL)
    OR
    -- 2. Transferência: exige conta de origem e destino distintas; proíbe cartão e mês de fatura
    (type = 'transfer' AND account_id IS NOT NULL AND to_account_id IS NOT NULL AND account_id <> to_account_id AND card_id IS NULL AND invoice_month IS NULL)
    OR
    -- 3. Compra no Cartão: exige cartão; proíbe contas e mês de fatura
    (type = 'cardPurchase' AND card_id IS NOT NULL AND account_id IS NULL AND to_account_id IS NULL AND invoice_month IS NULL)
    OR
    -- 4. Pagamento de Fatura: exige conta pagadora, cartão e invoice_month obrigatório no formato YYYY-MM
    (type = 'cardPayment' AND account_id IS NOT NULL AND card_id IS NOT NULL AND to_account_id IS NULL AND invoice_month IS NOT NULL AND invoice_month ~ '^\d{4}-(0[1-9]|1[0-2])$')
  )
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transactions_select" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert" ON public.transactions;
DROP POLICY IF EXISTS "transactions_update" ON public.transactions;
DROP POLICY IF EXISTS "transactions_delete" ON public.transactions;

CREATE POLICY "transactions_select" ON public.transactions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "transactions_insert" ON public.transactions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (account_id IS NULL OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = transactions.account_id AND a.user_id = auth.uid()))
    AND (to_account_id IS NULL OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = transactions.to_account_id AND a.user_id = auth.uid()))
    AND (card_id IS NULL OR EXISTS (SELECT 1 FROM public.cards c WHERE c.id = transactions.card_id AND c.user_id = auth.uid()))
    AND (EXISTS (SELECT 1 FROM public.members m WHERE m.id = transactions.member_id AND m.user_id = auth.uid()))
  );

CREATE POLICY "transactions_update" ON public.transactions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (account_id IS NULL OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = transactions.account_id AND a.user_id = auth.uid()))
    AND (to_account_id IS NULL OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = transactions.to_account_id AND a.user_id = auth.uid()))
    AND (card_id IS NULL OR EXISTS (SELECT 1 FROM public.cards c WHERE c.id = transactions.card_id AND c.user_id = auth.uid()))
    AND (EXISTS (SELECT 1 FROM public.members m WHERE m.id = transactions.member_id AND m.user_id = auth.uid()))
  );

CREATE POLICY "transactions_delete" ON public.transactions FOR DELETE USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.transactions FROM anon, public, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transactions TO authenticated;
GRANT ALL ON TABLE public.transactions TO service_role;

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON public.transactions (account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_card ON public.transactions (card_id);

-- ==============================================================================
-- 9. TABELA DE IDEMPOTÊNCIA DE IMPORTAÇÕES (IMPORT_LOGS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.import_logs (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  import_id TEXT NOT NULL CHECK (char_length(trim(import_id)) > 0 AND char_length(import_id) <= 128),
  content_hash TEXT NOT NULL CHECK (char_length(content_hash) = 64),
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'failed')),
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  completed_at TIMESTAMPTZ,
  CONSTRAINT uq_import_logs_user_import UNIQUE (user_id, import_id)
);

ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "import_logs_select" ON public.import_logs;
CREATE POLICY "import_logs_select" ON public.import_logs FOR SELECT USING (auth.uid() = user_id);

-- PRIVILÉGIOS REAIS E SEGURANÇA MÍNIMA:
-- Clientes authenticated possuem APENAS permissão de SELECT sobre seus próprios registros via RLS.
-- Permissões de INSERT, UPDATE e DELETE são revogadas na tabela para authenticated, anon e public.
-- Nenhuma função auxiliar exposta é necessária: a gravação em import_logs é encapsulada
-- exclusivamente dentro da RPC privilegiada import_user_state (SECURITY DEFINER).
REVOKE ALL ON TABLE public.import_logs FROM public, anon, authenticated;
GRANT SELECT ON TABLE public.import_logs TO authenticated;
GRANT ALL ON TABLE public.import_logs TO service_role;

-- ==============================================================================
-- 10. RPC DE IMPORTAÇÃO ATÔMICA E IDEMPOTENTE (SECURITY DEFINER ENCAPSULADA)
-- ==============================================================================
-- A função é declarada como SECURITY DEFINER para gerenciar diretamente a gravação
-- em import_logs sem conceder privilégio de INSERT/UPDATE à role authenticated.
-- O isolamento de dados do usuário é estritamente garantido porque:
--   1. v_user_id é derivado diretamente e obrigatoriamente de auth.uid() (identidade autenticada pela camada Supabase Auth).
--   2. Todas as entidades inseridas recebem explicitamente user_id = v_user_id.
--   3. A verificação de espaço financeiro vazio é vinculada a v_user_id.
--   4. A trava advisory e o log de idempotência são isolados por v_user_id.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.import_user_state(
  payload JSONB,
  p_import_id TEXT
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = pg_catalog, extensions, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  v_id_map JSONB := '{"member":{},"account":{},"card":{},"goal":{},"contribution":{},"transaction":{}}'::jsonb;
  v_first_member UUID;
  v_user_id UUID := auth.uid();
  v_content_hash TEXT;
  v_existing_log RECORD;
  v_result JSONB;
  v_item JSONB;
  v_old_id TEXT;
  v_new_id UUID;
  v_acc_id UUID;
  v_to_acc_id UUID;
  v_card_id UUID;
  v_goal_id UUID;
  v_member_id UUID;
  v_tx_type TEXT;
  v_inv_month TEXT;
  v_required_col TEXT;
  v_accounts_count INT := 0;
  v_cards_count INT := 0;
  v_goals_count INT := 0;
  v_contributions_count INT := 0;
  v_members_count INT := 0;
  v_transactions_count INT := 0;
BEGIN
  -- 1. Autenticação obrigatória derivada estritamente de auth.uid()
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado. Operação permitida apenas para usuários conectados.';
  END IF;

  IF p_import_id IS NULL OR trim(p_import_id) = '' OR char_length(p_import_id) > 128 THEN
    RAISE EXCEPTION 'Parâmetro p_import_id é obrigatório para garantir idempotência.';
  END IF;

  -- 2. Validação estrutural rigorosa do Payload antes de qualquer gravação
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'Payload de importação inválido: deve ser um objeto JSON.';
  END IF;

  -- Todas as coleções do formato de backup devem ser arrays JSON obrigatórios
  FOREACH v_required_col IN ARRAY ARRAY['members', 'accounts', 'cards', 'goals', 'contributions', 'transactions'] LOOP
    IF payload->v_required_col IS NULL OR jsonb_typeof(payload->v_required_col) <> 'array' THEN
      RAISE EXCEPTION 'Coleção obrigatória "%" ausente ou não é um array JSON.', v_required_col;
    END IF;
  END LOOP;

  IF payload->'preferences' IS NULL OR jsonb_typeof(payload->'preferences') <> 'object' THEN
    RAISE EXCEPTION 'Objeto "preferences" é obrigatório no payload.';
  END IF;

  -- 3. Proteção contra importações concorrentes do mesmo usuário via advisory transaction lock
  PERFORM pg_advisory_xact_lock(hashtext('import_user_state_' || v_user_id::text));

  -- 4. Calcular hash SHA-256 do payload usando digest() (pgcrypto em extensions/public)
  v_content_hash := encode(extensions.digest(payload::text, 'sha256'), 'hex');

  -- 5. Checagem de Idempotência
  SELECT * INTO v_existing_log FROM public.import_logs
  WHERE user_id = v_user_id AND import_id = p_import_id;

  IF FOUND THEN
    IF v_existing_log.status = 'completed' THEN
      IF v_existing_log.content_hash = v_content_hash THEN
        -- Repetição idêntica após timeout: devolve o resultado prévio sem duplicar nada
        RETURN v_existing_log.result;
      ELSE
        RAISE EXCEPTION 'Identificador de importação "%" já foi concluído anteriormente com outro conteúdo.', p_import_id;
      END IF;
    ELSIF v_existing_log.status = 'in_progress' THEN
      RAISE EXCEPTION 'Uma importação com o identificador "%" já está em andamento.', p_import_id;
    END IF;
  ELSE
    INSERT INTO public.import_logs (user_id, import_id, content_hash, status)
    VALUES (v_user_id, p_import_id, v_content_hash, 'in_progress');
  END IF;

  -- 6. Regra Estrita: Importar apenas para um espaço financeiro vazio
  IF EXISTS (SELECT 1 FROM public.accounts WHERE user_id = v_user_id) OR
     EXISTS (SELECT 1 FROM public.cards WHERE user_id = v_user_id) OR
     EXISTS (SELECT 1 FROM public.goals WHERE user_id = v_user_id) OR
     EXISTS (SELECT 1 FROM public.contributions WHERE user_id = v_user_id) OR
     EXISTS (SELECT 1 FROM public.members WHERE user_id = v_user_id) OR
     EXISTS (SELECT 1 FROM public.transactions WHERE user_id = v_user_id) THEN
    UPDATE public.import_logs
    SET status = 'failed',
        error_message = 'Espaço financeiro não está vazio',
        completed_at = now()
    WHERE user_id = v_user_id AND import_id = p_import_id;

    RAISE EXCEPTION 'O seu espaço financeiro na nuvem não está vazio. Esta versão permite importar apenas para contas sem registros prévios.';
  END IF;

  -- IDs são mapeados em memória local, sem objetos controlados pelo chamador.

  -- 8. Validar e Inserir MEMBERS
  FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'members') LOOP
    v_old_id := v_item->>'id';
    IF jsonb_typeof(v_item->'id') IS DISTINCT FROM 'string' OR v_old_id IS NULL OR trim(v_old_id) = '' THEN
      RAISE EXCEPTION 'Membro com ID ausente ou vazio.';
    END IF;
    IF (v_id_map->'member') ? v_old_id THEN
      RAISE EXCEPTION 'ID duplicado "%" na coleção de membros.', v_old_id;
    END IF;
    IF v_item->>'name' IS NULL OR trim(v_item->>'name') = '' OR char_length(v_item->>'name') > 60 THEN
      RAISE EXCEPTION 'Membro com nome inválido (máx. 60 caracteres).';
    END IF;

    v_new_id := pg_catalog.gen_random_uuid();
    v_id_map := jsonb_set(v_id_map, ARRAY['member', v_old_id], to_jsonb(v_new_id));
    v_first_member := COALESCE(v_first_member, v_new_id);

    INSERT INTO public.members (id, user_id, name)
    VALUES (v_new_id, v_user_id, trim(v_item->>'name'));
    v_members_count := v_members_count + 1;
  END LOOP;

  -- Se o backup não possui membros mas contém preferências, cria o membro titular padrão 'me'
  IF v_members_count = 0 THEN
    v_new_id := pg_catalog.gen_random_uuid();
    v_id_map := jsonb_set(v_id_map, ARRAY['member', 'me'], to_jsonb(v_new_id));
    INSERT INTO public.members (id, user_id, name)
    VALUES (v_new_id, v_user_id, COALESCE(trim(payload->'preferences'->>'displayName'), 'Você'));
    v_members_count := 1;
  END IF;

  -- 9. Validar e Inserir ACCOUNTS
  FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'accounts') LOOP
    v_old_id := v_item->>'id';
    IF jsonb_typeof(v_item->'id') IS DISTINCT FROM 'string' OR v_old_id IS NULL OR trim(v_old_id) = '' THEN
      RAISE EXCEPTION 'Conta com ID ausente ou vazio.';
    END IF;
    IF (v_id_map->'account') ? v_old_id THEN
      RAISE EXCEPTION 'ID duplicado "%" na coleção de contas.', v_old_id;
    END IF;
    IF v_item->>'name' IS NULL OR trim(v_item->>'name') = '' OR char_length(v_item->>'name') > 80 THEN
      RAISE EXCEPTION 'Conta com nome inválido: "%" (máx. 80 caracteres).', v_item->>'name';
    END IF;
    IF v_item->>'initialCents' IS NULL OR (v_item->>'initialCents') !~ '^-?\d+$' THEN
      RAISE EXCEPTION 'Conta "%" com saldo inicial inválido.', v_item->>'name';
    END IF;
    IF v_item->>'color' IS NULL OR (v_item->>'color') !~* '^#[0-9a-f]{6}$' THEN
      RAISE EXCEPTION 'Conta "%" com cor hexadecimal inválida.', v_item->>'name';
    END IF;

    v_new_id := pg_catalog.gen_random_uuid();
    v_id_map := jsonb_set(v_id_map, ARRAY['account', v_old_id], to_jsonb(v_new_id));

    INSERT INTO public.accounts (id, user_id, name, initial_cents, color)
    VALUES (
      v_new_id,
      v_user_id,
      trim(v_item->>'name'),
      (v_item->>'initialCents')::BIGINT,
      v_item->>'color'
    );
    v_accounts_count := v_accounts_count + 1;
  END LOOP;

  -- 10. Validar e Inserir CARDS
  FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'cards') LOOP
    v_old_id := v_item->>'id';
    IF jsonb_typeof(v_item->'id') IS DISTINCT FROM 'string' OR v_old_id IS NULL OR trim(v_old_id) = '' THEN
      RAISE EXCEPTION 'Cartão com ID ausente ou vazio.';
    END IF;
    IF (v_id_map->'card') ? v_old_id THEN
      RAISE EXCEPTION 'ID duplicado "%" na coleção de cartões.', v_old_id;
    END IF;
    IF v_item->>'name' IS NULL OR trim(v_item->>'name') = '' OR char_length(v_item->>'name') > 80 THEN
      RAISE EXCEPTION 'Cartão com nome inválido: "%".', v_item->>'name';
    END IF;
    IF v_item->>'limitCents' IS NULL OR (v_item->>'limitCents') !~ '^\d+$' OR (v_item->>'limitCents')::BIGINT <= 0 THEN
      RAISE EXCEPTION 'Cartão "%" com limite inválido.', v_item->>'name';
    END IF;
    IF v_item->>'color' IS NULL OR (v_item->>'color') !~* '^#[0-9a-f]{6}$' THEN
      RAISE EXCEPTION 'Cartão "%" com cor hexadecimal inválida.', v_item->>'name';
    END IF;
    IF v_item->>'closingDay' IS NULL OR (v_item->>'closingDay')::INT < 1 OR (v_item->>'closingDay')::INT > 31 THEN
      RAISE EXCEPTION 'Cartão "%" com dia de fechamento inválido (deve ser entre 1 e 31).', v_item->>'name';
    END IF;
    IF v_item->>'dueDay' IS NULL OR (v_item->>'dueDay')::INT < 1 OR (v_item->>'dueDay')::INT > 31 THEN
      RAISE EXCEPTION 'Cartão "%" com dia de vencimento inválido (deve ser entre 1 e 31).', v_item->>'name';
    END IF;

    v_new_id := pg_catalog.gen_random_uuid();
    v_id_map := jsonb_set(v_id_map, ARRAY['card', v_old_id], to_jsonb(v_new_id));

    INSERT INTO public.cards (id, user_id, name, limit_cents, color, closing_day, due_day)
    VALUES (
      v_new_id,
      v_user_id,
      trim(v_item->>'name'),
      (v_item->>'limitCents')::BIGINT,
      v_item->>'color',
      (v_item->>'closingDay')::SMALLINT,
      (v_item->>'dueDay')::SMALLINT
    );
    v_cards_count := v_cards_count + 1;
  END LOOP;

  -- 11. Validar e Inserir GOALS
  FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'goals') LOOP
    v_old_id := v_item->>'id';
    IF jsonb_typeof(v_item->'id') IS DISTINCT FROM 'string' OR v_old_id IS NULL OR trim(v_old_id) = '' THEN
      RAISE EXCEPTION 'Meta com ID ausente ou vazio.';
    END IF;
    IF (v_id_map->'goal') ? v_old_id THEN
      RAISE EXCEPTION 'ID duplicado "%" na coleção de metas.', v_old_id;
    END IF;
    IF v_item->>'name' IS NULL OR trim(v_item->>'name') = '' OR char_length(v_item->>'name') > 80 THEN
      RAISE EXCEPTION 'Meta com nome inválido: "%".', v_item->>'name';
    END IF;
    IF v_item->>'kind' IS NULL OR (v_item->>'kind') NOT IN ('general', 'car', 'home') THEN
      RAISE EXCEPTION 'Meta "%" com tipo inválido: "%".', v_item->>'name', v_item->>'kind';
    END IF;
    IF v_item->>'targetCents' IS NULL OR (v_item->>'targetCents') !~ '^\d+$' OR (v_item->>'targetCents')::BIGINT <= 0 THEN
      RAISE EXCEPTION 'Meta "%" com valor alvo inválido.', v_item->>'name';
    END IF;
    IF v_item->>'targetDate' IS NULL OR (v_item->>'targetDate') !~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$' THEN
      RAISE EXCEPTION 'Meta "%" com data alvo inválida.', v_item->>'name';
    END IF;

    v_new_id := pg_catalog.gen_random_uuid();
    v_id_map := jsonb_set(v_id_map, ARRAY['goal', v_old_id], to_jsonb(v_new_id));

    INSERT INTO public.goals (id, user_id, name, kind, target_cents, initial_cents, target_date)
    VALUES (
      v_new_id,
      v_user_id,
      trim(v_item->>'name'),
      v_item->>'kind',
      (v_item->>'targetCents')::BIGINT,
      COALESCE((v_item->>'initialCents')::BIGINT, 0),
      (v_item->>'targetDate')::DATE
    );
    v_goals_count := v_goals_count + 1;
  END LOOP;

  -- 12. Validar e Inserir CONTRIBUTIONS com verificação de duplicidade e integridade
  FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'contributions') LOOP
    v_old_id := v_item->>'id';
    IF jsonb_typeof(v_item->'id') IS DISTINCT FROM 'string' OR v_old_id IS NULL OR trim(v_old_id) = '' THEN
      RAISE EXCEPTION 'Aporte com ID ausente ou vazio.';
    END IF;
    IF (v_id_map->'contribution') ? v_old_id THEN
      RAISE EXCEPTION 'ID duplicado "%" na coleção de aportes.', v_old_id;
    END IF;

    -- Validação do goalId: OBRIGATÓRIO e deve existir no mapa local (SEM CONVERSÃO SILENCIOSA EM NULL)
    IF v_item->>'goalId' IS NULL OR trim(v_item->>'goalId') = '' THEN
      RAISE EXCEPTION 'Aporte "%" sem goalId informado.', v_old_id;
    END IF;

    v_goal_id := NULL;
    v_goal_id := (v_id_map #>> ARRAY['goal', v_item->>'goalId'])::uuid;
    IF v_goal_id IS NULL THEN
      RAISE EXCEPTION 'Aporte "%" referencia goalId inexistente no payload: "%".', v_old_id, v_item->>'goalId';
    END IF;

    IF v_item->>'amountCents' IS NULL OR (v_item->>'amountCents') !~ '^\d+$' OR (v_item->>'amountCents')::BIGINT <= 0 THEN
      RAISE EXCEPTION 'Aporte "%" com valor inválido.', v_old_id;
    END IF;
    IF v_item->>'date' IS NULL OR (v_item->>'date') !~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$' THEN
      RAISE EXCEPTION 'Aporte "%" com data inválida.', v_old_id;
    END IF;

    v_new_id := pg_catalog.gen_random_uuid();
    v_id_map := jsonb_set(v_id_map, ARRAY['contribution', v_old_id], to_jsonb(v_new_id));

    INSERT INTO public.contributions (id, user_id, goal_id, date, amount_cents)
    VALUES (
      v_new_id,
      v_user_id,
      v_goal_id,
      (v_item->>'date')::DATE,
      (v_item->>'amountCents')::BIGINT
    );
    v_contributions_count := v_contributions_count + 1;
  END LOOP;

  -- 13. Validar e Inserir TRANSACTIONS com preservação estrita de referências
  FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'transactions') LOOP
    v_old_id := v_item->>'id';
    IF jsonb_typeof(v_item->'id') IS DISTINCT FROM 'string' OR v_old_id IS NULL OR trim(v_old_id) = '' THEN
      RAISE EXCEPTION 'Transação com ID ausente ou vazio.';
    END IF;
    IF (v_id_map->'transaction') ? v_old_id THEN
      RAISE EXCEPTION 'ID duplicado "%" na coleção de transações.', v_old_id;
    END IF;

    v_tx_type := v_item->>'type';
    v_acc_id := NULL;
    v_to_acc_id := NULL;
    v_card_id := NULL;
    v_member_id := NULL;
    v_inv_month := v_item->>'invoiceMonth';

    -- Validação do memberId:
    -- Se informado: DEVE existir no payload (SEM FALLBACK SILENCIOSO)
    IF v_item->>'memberId' IS NOT NULL AND trim(v_item->>'memberId') <> '' THEN
      v_member_id := (v_id_map #>> ARRAY['member', v_item->>'memberId'])::uuid;
      IF v_member_id IS NULL THEN
        RAISE EXCEPTION 'Transação "%" referencia memberId inexistente no payload: "%".', v_item->>'description', v_item->>'memberId';
      END IF;
    ELSE
      -- Se ausente: aplica a regra real do app, vinculando ao titular 'me' ou primeiro membro
      v_member_id := (v_id_map #>> ARRAY['member', 'me'])::uuid;
      IF v_member_id IS NULL THEN
        v_member_id := v_first_member;
      END IF;
      IF v_member_id IS NULL THEN
        RAISE EXCEPTION 'Transação "%" sem membro titular associável.', v_item->>'description';
      END IF;
    END IF;

    -- Validação do accountId informado (NÃO CONVERTER EM NULL SE INVÁLIDO)
    IF v_item->>'accountId' IS NOT NULL THEN
      v_acc_id := (v_id_map #>> ARRAY['account', v_item->>'accountId'])::uuid;
      IF v_acc_id IS NULL THEN
        RAISE EXCEPTION 'Transação "%" referencia accountId inexistente no payload: "%".', v_item->>'description', v_item->>'accountId';
      END IF;
    END IF;

    -- Validação do toAccountId informado (NÃO CONVERTER EM NULL SE INVÁLIDO)
    IF v_item->>'toAccountId' IS NOT NULL THEN
      v_to_acc_id := (v_id_map #>> ARRAY['account', v_item->>'toAccountId'])::uuid;
      IF v_to_acc_id IS NULL THEN
        RAISE EXCEPTION 'Transferência "%" referencia toAccountId inexistente no payload: "%".', v_item->>'description', v_item->>'toAccountId';
      END IF;
    END IF;

    -- Validação do cardId informado (NÃO CONVERTER EM NULL SE INVÁLIDO)
    IF v_item->>'cardId' IS NOT NULL THEN
      v_card_id := (v_id_map #>> ARRAY['card', v_item->>'cardId'])::uuid;
      IF v_card_id IS NULL THEN
        RAISE EXCEPTION 'Transação de cartão "%" referencia cardId inexistente no payload: "%".', v_item->>'description', v_item->>'cardId';
      END IF;
    END IF;

    -- Checagem rigorosa das regras reais do aplicativo por tipo de movimentação
    IF v_tx_type IN ('income', 'expense') THEN
      IF v_acc_id IS NULL OR v_to_acc_id IS NOT NULL OR v_card_id IS NOT NULL OR v_inv_month IS NOT NULL THEN
        RAISE EXCEPTION 'Lançamento "%" (%): exige accountId e proíbe toAccountId, cardId e invoiceMonth.', v_item->>'description', v_tx_type;
      END IF;
    ELSIF v_tx_type = 'transfer' THEN
      IF v_acc_id IS NULL OR v_to_acc_id IS NULL OR v_acc_id = v_to_acc_id OR v_card_id IS NOT NULL OR v_inv_month IS NOT NULL THEN
        RAISE EXCEPTION 'Transferência "%": exige accountId e toAccountId distintos; proíbe cardId e invoiceMonth.', v_item->>'description';
      END IF;
    ELSIF v_tx_type = 'cardPurchase' THEN
      IF v_card_id IS NULL OR v_acc_id IS NOT NULL OR v_to_acc_id IS NOT NULL OR v_inv_month IS NOT NULL THEN
        RAISE EXCEPTION 'Compra no cartão "%": exige cardId; proíbe accountId, toAccountId e invoiceMonth.', v_item->>'description';
      END IF;
    ELSIF v_tx_type = 'cardPayment' THEN
      IF v_acc_id IS NULL OR v_card_id IS NULL OR v_to_acc_id IS NOT NULL OR v_inv_month IS NULL OR v_inv_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
        RAISE EXCEPTION 'Pagamento de fatura "%": exige accountId, cardId e invoiceMonth no formato YYYY-MM; proíbe toAccountId.', v_item->>'description';
      END IF;
    ELSE
      RAISE EXCEPTION 'Tipo de transação desconhecido: "%".', v_tx_type;
    END IF;

    IF v_item->>'amountCents' IS NULL OR (v_item->>'amountCents') !~ '^\d+$' OR (v_item->>'amountCents')::BIGINT <= 0 THEN
      RAISE EXCEPTION 'Transação "%" com valor inválido.', v_item->>'description';
    END IF;
    IF v_item->>'date' IS NULL OR (v_item->>'date') !~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$' THEN
      RAISE EXCEPTION 'Transação "%" com data inválida.', v_item->>'description';
    END IF;

    v_new_id := pg_catalog.gen_random_uuid();
    v_id_map := jsonb_set(v_id_map, ARRAY['transaction', v_old_id], to_jsonb(v_new_id));

    INSERT INTO public.transactions (
      id,
      user_id,
      description,
      notes,
      type,
      amount_cents,
      date,
      account_id,
      to_account_id,
      card_id,
      invoice_month,
      category,
      tags,
      priority,
      member_id
    )
    VALUES (
      v_new_id,
      v_user_id,
      trim(v_item->>'description'),
      v_item->>'notes',
      v_tx_type,
      (v_item->>'amountCents')::BIGINT,
      (v_item->>'date')::DATE,
      v_acc_id,
      v_to_acc_id,
      v_card_id,
      v_inv_month,
      COALESCE(v_item->>'category', 'Outros'),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'tags', '[]'::jsonb))),
      v_item->>'priority',
      v_member_id
    );
    v_transactions_count := v_transactions_count + 1;
  END LOOP;

  -- 14. Atualizar Preferências do Perfil
  INSERT INTO public.profiles (
    user_id,
    display_name,
    theme,
    hide_amounts,
    avatar_preset,
    avatar_emoji,
    avatar_data,
    flow_chart_type,
    updated_at
  )
  VALUES (
    v_user_id,
    COALESCE(payload->'preferences'->>'displayName', 'Você'),
    COALESCE(payload->'preferences'->>'theme', 'dark'),
    COALESCE((payload->'preferences'->>'hideAmounts')::BOOLEAN, false),
    payload->'preferences'->>'avatarPreset',
    payload->'preferences'->>'emoji',
    payload->'preferences'->>'avatar',
    COALESCE(payload->'preferences'->>'flowChartType', 'line'),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    theme = EXCLUDED.theme,
    hide_amounts = EXCLUDED.hide_amounts,
    avatar_preset = EXCLUDED.avatar_preset,
    avatar_emoji = EXCLUDED.avatar_emoji,
    avatar_data = EXCLUDED.avatar_data,
    flow_chart_type = EXCLUDED.flow_chart_type,
    updated_at = now();

  -- 15. Gravar Sucesso e Montar Resumo no Log de Idempotência
  v_result := jsonb_build_object(
    'success', true,
    'import_id', p_import_id,
    'imported_at', now(),
    'counts', jsonb_build_object(
      'members', v_members_count,
      'accounts', v_accounts_count,
      'cards', v_cards_count,
      'goals', v_goals_count,
      'contributions', v_contributions_count,
      'transactions', v_transactions_count
    )
  );

  UPDATE public.import_logs
  SET status = 'completed',
      result = v_result,
      error_message = NULL,
      completed_at = now()
  WHERE user_id = v_user_id AND import_id = p_import_id;

  RETURN v_result;
END;
$$;

-- Restrição estrita de privilégios da RPC de importação
REVOKE ALL ON FUNCTION public.import_user_state(JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_user_state(JSONB, TEXT) TO authenticated, service_role;

-- Remove a função privilegiada obsoleta de versões anteriores.
DROP FUNCTION IF EXISTS public.record_import_log_step(TEXT, TEXT, TEXT, JSONB, TEXT);
