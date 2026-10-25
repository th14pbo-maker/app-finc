-- ==============================================================================
-- Finance OS — Migration: Abertura de Cadastro Direto
-- Permite que qualquer familiar ou pessoa cadastre seu e-mail e senha diretamente,
-- sem necessidade de pré-autorização administrativa em public.allowed_emails.
-- Mantém 100% o isolamento e proteção por usuário via Row Level Security (RLS).
-- ==============================================================================

-- Remove o trigger que bloqueava e-mails fora de public.allowed_emails
DROP TRIGGER IF EXISTS on_auth_user_created_whitelist ON auth.users;

-- Remove a função restritiva
DROP FUNCTION IF EXISTS public.check_user_registration_allowed();
