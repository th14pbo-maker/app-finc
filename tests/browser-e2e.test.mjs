/**
 * Testes Automatizados no Navegador (Chromium via Playwright)
 * Executado quando BROWSER_TEST=1.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const runBrowser = process.env.BROWSER_TEST === '1';

test('Navegador E2E: Renderização de Telas, Formulários de Autenticação e Configuração PWA', { skip: !runBrowser }, async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const baseUrl = process.env.APP_URL || 'http://127.0.0.1:8765';

  try {
    // 1. Acesso à página inicial
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
    const title = await page.title();
    assert.ok(title.includes('Finance OS'), `Título inesperado: ${title}`);

    // Verifica badge de modo local no topo
    const badgeText = await page.locator('.demo-badge').first().innerText();
    assert.equal(badgeText, 'MODO LOCAL');

    // 2. Navegação para tela de Login (#login)
    await page.goto(`${baseUrl}/index.html#login`);
    await page.waitForSelector('form input[type="email"]');
    const emailField = page.locator('form input[type="email"]');
    const passField = page.locator('form input[type="password"]');
    assert.equal(await emailField.count(), 1, 'Campo de e-mail de login deve existir');
    assert.equal(await passField.count(), 1, 'Campo de senha de login deve existir');

    // 3. Navegação para tela de Cadastro (#signup)
    await page.goto(`${baseUrl}/index.html#signup`);
    await page.waitForSelector('.notice.info');
    const noticeText = await page.locator('.notice.info').innerText();
    assert.ok(noticeText.includes('restrito aos membros convidados'), 'Aviso de convite deve estar presente na tela de cadastro');

    // 4. Navegação para tela de Configurações (#settings)
    await page.goto(`${baseUrl}/index.html#settings`);
    await page.waitForSelector('.settings');
    const settingsCount = await page.locator('.settings').count();
    assert.equal(settingsCount, 1, 'Área de configurações deve renderizar');

    // 5. Verificação do Web Manifest e Service Worker
    const manifestRes = await page.request.get(`${baseUrl}/manifest.webmanifest`);
    assert.equal(manifestRes.status(), 200);
    const manifestJson = await manifestRes.json();
    assert.equal(manifestJson.short_name, 'Finance OS');

    const swRes = await page.request.get(`${baseUrl}/sw.js`);
    assert.equal(swRes.status(), 200);
    const swText = await swRes.text();
    assert.ok(swText.includes('finance-os-v28'), 'Service Worker deve ser v28');

    console.log('PASS: Todas as telas, formulários e PWA validados no navegador Chromium!');
  } finally {
    await browser.close();
  }
});
