/**
 * Testes Automatizados no Navegador (Chromium via Playwright)
 * Executado quando BROWSER_TEST=1.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const runBrowser = process.env.BROWSER_TEST === '1';

test('Navegador E2E: Renderização de Telas, Formulários de Autenticação e Configuração PWA', { skip: !runBrowser }, async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const baseUrl = process.env.APP_URL || 'http://127.0.0.1:8765';

  try {
    // 1. Acesso à página inicial sem sessão: login obrigatório
    console.log('[Browser 1/5] Acessando index.html sem sessão...');
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
    const title = await page.title();
    assert.ok(title.includes('Finance OS'), `Título inesperado: ${title}`);

    // Verifica que finanças não são exibidas e o formulário de login é renderizado
    await page.waitForSelector('form input[type="email"]', { timeout: 10000 });
    const emailField = page.locator('form input[type="email"]');
    const passField = page.locator('form input[type="password"]');
    assert.equal(await emailField.count(), 1, 'Campo de e-mail de login deve existir');
    assert.equal(await passField.count(), 1, 'Campo de senha de login deve existir');
    console.log('[Browser 1/5] Login obrigatório validado ao acessar sem autenticação.');

    // 2. Navegação para tela de Login explícita (#login)
    console.log('[Browser 2/5] Testando tela de Login (#login)...');
    await page.goto(`${baseUrl}/index.html#login`, { waitUntil: 'networkidle' });
    await page.waitForSelector('form input[type="email"]', { timeout: 10000 });
    console.log('[Browser 2/5] Formulário de Login validado.');

    // 3. Navegação para tela de Cadastro (#signup)
    console.log('[Browser 3/5] Testando tela de Cadastro (#signup)...');
    await page.goto(`${baseUrl}/index.html#signup`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.notice.info', { timeout: 10000 });
    const noticeText = await page.locator('.notice.info').innerText();
    assert.ok(noticeText.includes('Privacidade total'), 'Aviso de privacidade deve estar presente na tela de cadastro');
    console.log('[Browser 3/5] Formulário de Cadastro e aviso de privacidade validados.');

    // 4. Navegação para tela de Recuperação de Senha (#forgot-password)
    console.log('[Browser 4/5] Testando tela de Recuperação (#forgot-password)...');
    await page.goto(`${baseUrl}/index.html#forgot-password`, { waitUntil: 'networkidle' });
    await page.waitForSelector('form input[type="email"]', { timeout: 10000 });
    const recSubmit = page.locator('form button[type="submit"]');
    assert.ok((await recSubmit.innerText()).includes('recuperação'), 'Botão de recuperação deve existir');
    console.log('[Browser 4/5] Tela de recuperação validada.');

    // 5. Verificação do Web Manifest e Service Worker
    console.log('[Browser 5/5] Testando Web Manifest e Service Worker PWA...');
    const manifestRes = await page.request.get(`${baseUrl}/manifest.webmanifest`);
    assert.equal(manifestRes.status(), 200);
    const manifestJson = await manifestRes.json();
    assert.equal(manifestJson.short_name, 'Finance OS');

    const swRes = await page.request.get(`${baseUrl}/sw.js`);
    assert.equal(swRes.status(), 200);
    const swText = await swRes.text();
    assert.ok(swText.includes('finance-os-v29'), 'Service Worker deve ser v29');
    console.log('[Browser 5/5] Manifest e Service Worker v29 validados.');

    console.log('PASS: Todas as telas, formulários e PWA validados no navegador Chromium!');
  } finally {
    await browser.close();
  }
});
