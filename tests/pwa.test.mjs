import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

test('PWA: manifest.webmanifest válido e ícones acessíveis', async () => {
  const manifestPath = path.join(root, 'app', 'manifest.webmanifest');
  const content = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(content);

  assert.equal(manifest.name, 'Finance OS — Seu dinheiro, com clareza');
  assert.equal(manifest.short_name, 'Finance OS');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.lang, 'pt-BR');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);

  // Verifica que o arquivo de ícone referenciado existe
  for (const icon of manifest.icons) {
    const iconPath = path.join(root, 'app', icon.src);
    await assert.doesNotReject(access(iconPath), `Ícone ${icon.src} deve existir`);
  }
});

test('PWA: sw.js precacheia todos os assets necessários e ignora requisições de API Supabase', async () => {
  const swPath = path.join(root, 'app', 'sw.js');
  const content = await readFile(swPath, 'utf8');

  // 1. Deve conter versão v28
  assert.ok(content.includes('finance-os-v28'), 'Service Worker deve ter versão incrementada');

  // 2. Deve conter novos módulos nos assets pré-cacheados
  assert.ok(content.includes('./js/supabase.mjs'), 'sw.js deve pré-cachear supabase.mjs');
  assert.ok(content.includes('./js/sync.mjs'), 'sw.js deve pré-cachear sync.mjs');
  assert.ok(content.includes('./js/import-payload.mjs'), 'sw.js deve pré-cachear import-payload.mjs');

  // 3. Deve ignorar endpoints de API Supabase (/auth/v1/ e /rest/v1/)
  assert.ok(content.includes('/auth/v1/'), 'sw.js deve conter regra de bypass para /auth/v1/');
  assert.ok(content.includes('/rest/v1/'), 'sw.js deve conter regra de bypass para /rest/v1/');

  // 4. Todos os arquivos estáticos listados em PRECACHE_ASSETS devem existir no disco
  const assetMatches = content.match(/'\.\/([^']+)'/g);
  for (const match of assetMatches) {
    const rel = match.replace(/^'\.\//, '').replace(/'$/, '');
    if (!rel) continue; // './' is root
    const filePath = path.join(root, 'app', rel);
    await assert.doesNotReject(access(filePath), `Asset pré-cacheado "${rel}" deve existir no disco`);
  }
});
