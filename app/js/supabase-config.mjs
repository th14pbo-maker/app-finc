/**
 * Finance OS — Supabase Configuration Management
 * Suporta desenvolvimento local (127.0.0.1:54321), injeção via ambiente ou credenciais públicas pré-configuradas.
 * 
 * PREPARAÇÃO PARA PUBLICAÇÃO:
 * Ao publicar para a família, preencha as variáveis em PUBLIC_PROJECT_CONFIG abaixo com o endereço do seu
 * projeto Supabase gratuito (ex: https://xxxx.supabase.co) e a anon public key.
 * Dessa forma, NENHUM familiar precisa configurar URL ou chaves manualmente — eles apenas abrem o PWA e fazem login.
 */

export const PUBLIC_PROJECT_CONFIG = {
  url: 'https://dauinbklyxsnrcwrowsl.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhdWluYmtseXhzbnJjd3Jvd3NsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4OTMzMDksImV4cCI6MjEwODQ2OTMwOX0.Liz-0tEDqqaERTsA8PNPEYTG_COfFz3hpgOGjAmCldg'
};

const STORAGE_KEY = 'finance-os:supabase-config:v1';

const LOCAL_FALLBACK_CONFIG = {
  url: 'http://127.0.0.1:54321',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODMyOTI4MDB9.dummy_anon_key_for_local_development'
};

export function getSupabaseConfig(storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
  // 1. Variável global injetada via script tag ou backend
  if (typeof window !== 'undefined' && window.__FINANCE_OS_CONFIG__?.supabaseUrl) {
    return {
      url: window.__FINANCE_OS_CONFIG__.supabaseUrl.trim().replace(/\/$/, ''),
      anonKey: window.__FINANCE_OS_CONFIG__.supabaseAnonKey || PUBLIC_PROJECT_CONFIG.anonKey || LOCAL_FALLBACK_CONFIG.anonKey
    };
  }

  // 2. Configuração manual do usuário em localStorage (sobrescreve se configurado)
  if (storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.url && typeof parsed.url === 'string') {
          return {
            url: parsed.url.trim().replace(/\/$/, ''),
            anonKey: (parsed.anonKey || '').trim() || PUBLIC_PROJECT_CONFIG.anonKey || LOCAL_FALLBACK_CONFIG.anonKey
          };
        }
      }
    } catch {}
  }

  // 3. Configuração pública pré-configurada para a família
  if (PUBLIC_PROJECT_CONFIG.url) {
    return {
      url: PUBLIC_PROJECT_CONFIG.url.trim().replace(/\/$/, ''),
      anonKey: PUBLIC_PROJECT_CONFIG.anonKey.trim() || LOCAL_FALLBACK_CONFIG.anonKey
    };
  }

  // 4. Fallback padrão local
  return { ...LOCAL_FALLBACK_CONFIG };
}

export function saveSupabaseConfig(config, storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
  if (!storage) return false;
  try {
    const clean = {
      url: (config.url || '').trim().replace(/\/$/, ''),
      anonKey: (config.anonKey || '').trim()
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(clean));
    return true;
  } catch {
    return false;
  }
}
