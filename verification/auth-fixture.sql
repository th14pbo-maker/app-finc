-- SOMENTE para PostgreSQL embarcado descartável. NÃO executar no Supabase.
-- Modelo mínimo de auth.users/auth.uid para testar SQL, não emula login/JWT/GoTrue.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}',role text,aud text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
-- Simula função vulnerável de uma versão antiga: a migração deve removê-la.
CREATE FUNCTION public.record_import_log_step(text,text,text,jsonb,text) RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;
