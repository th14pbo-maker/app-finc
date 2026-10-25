import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

test('Mobile Responsiveness: 1. Viewport Meta Configuration', () => {
  const html = fs.readFileSync(path.join(root, 'app/index.html'), 'utf-8');
  
  // Exactamente uma tag de viewport com content="width=device-width, initial-scale=1"
  const viewportMatches = html.match(/<meta[^>]*name=["']viewport["'][^>]*>/gi) || [];
  assert.equal(viewportMatches.length, 1, 'Deve existir exatamente uma tag viewport no HTML');
  assert.ok(viewportMatches[0].includes('width=device-width'), 'Viewport deve conter width=device-width');
  assert.ok(viewportMatches[0].includes('initial-scale=1'), 'Viewport deve conter initial-scale=1');
  assert.ok(!viewportMatches[0].includes('maximum-scale'), 'Não deve bloquear o zoom do usuário com maximum-scale');
});

test('Mobile Responsiveness: 2. Eliminação do Auto-Zoom no iOS (Font Size >= 16px nos formulários)', () => {
  const appCss = fs.readFileSync(path.join(root, 'app/styles/app.css'), 'utf-8');
  const assistantCss = fs.readFileSync(path.join(root, 'app/styles/assistant.css'), 'utf-8');

  // No mobile, inputs/selects/textareas devem ter font-size: 16px !important para evitar zoom-in do Safari
  assert.ok(appCss.includes('font-size:16px !important') || appCss.includes('font-size: 16px !important'),
    'app.css deve conter font-size: 16px !important para campos de formulário no mobile');
  
  assert.ok(appCss.includes('.statement-category-select') && appCss.includes('16px !important'),
    'Selects de categorias de extrato devem ter 16px no mobile para não acionar zoom ao tocar');

  assert.ok(assistantCss.includes('.assistant-form textarea') && assistantCss.includes('16px !important'),
    'Textarea do assistente por voz deve ter 16px no mobile');
});

test('Mobile Responsiveness: 3. Prevenção de Overflow Horizontal Global e Text Adjust', () => {
  const appCss = fs.readFileSync(path.join(root, 'app/styles/app.css'), 'utf-8');

  // html e body devem conter text-size-adjust: 100% e overflow-x: hidden
  assert.ok(appCss.includes('text-size-adjust:100%') || appCss.includes('text-size-adjust: 100%'),
    'Deve conter text-size-adjust: 100% para evitar redimensionamento arbitrário de texto no iOS');
  assert.ok(appCss.includes('overflow-x:hidden') || appCss.includes('overflow-x: hidden'),
    'Deve conter overflow-x: hidden no html/body/shell para evitar scroll horizontal');
});

test('Mobile Responsiveness: 4. Layout Mobile do Dashboard e Topbar (320px a 430px)', () => {
  const appCss = fs.readFileSync(path.join(root, 'app/styles/app.css'), 'utf-8');

  // Topbar no mobile deve esconder texto do botão do assistente para não estourar 320px
  assert.ok(appCss.includes('.topbar .assistant-trigger span{display:none}'),
    'Texto do botão de voz deve ser ocultado no mobile para manter a topbar compacta');

  // Heading actions devem empilhar verticalmente com 100% de largura
  assert.ok(appCss.includes('.heading .actions{display:flex;flex-direction:column;align-items:stretch;width:100%'),
    'Ações do cabeçalho devem ser organizadas em coluna ocupando 100% no mobile');

  // Metrics devem ter 1 coluna no mobile para não comprimir valores monetários
  assert.ok(appCss.includes('.metrics{grid-template-columns:1fr'),
    'Cards de métricas devem ocupar 1 coluna no mobile');

  // Dashboard grid deve usar minmax(0, 1fr) para evitar grid blowout
  assert.ok(appCss.includes('minmax(0,1fr) !important'),
    'Dashboard grid deve usar minmax(0, 1fr) no mobile');
});

test('Mobile Responsiveness: 5. Importação de Extratos Bancários Responsiva', () => {
  const appCss = fs.readFileSync(path.join(root, 'app/styles/app.css'), 'utf-8');

  // Abas de extrato em coluna no mobile
  assert.ok(appCss.includes('.statement-tabs') && appCss.includes('flex-direction: column'),
    'Abas do modal de extrato devem se organizar verticalmente no mobile');

  // Botões de ação em coluna reversa com largura total
  assert.ok(appCss.includes('.statement-actions-bar') && appCss.includes('flex-direction: column-reverse'),
    'Barra de ações do extrato deve usar column-reverse no mobile para o botão de confirmação ficar em destaque');

  assert.ok(appCss.includes('.statement-confirm-btn') && appCss.includes('width: 100% !important'),
    'Botão de confirmação de importação deve ter largura de 100% e permitir quebra de texto');

  // Resumo de entradas/saídas em 1 coluna
  assert.ok(appCss.includes('.statement-summary-grid') && appCss.includes('grid-template-columns: 1fr'),
    'Cards de resumo do extrato devem empilhar em 1 coluna no mobile');

  // Linhas de transação do extrato organizadas verticalmente com quebra de texto
  assert.ok(appCss.includes('.statement-row-top') && appCss.includes('flex-direction: column'),
    'Linhas de extrato devem reorganizar descrição e valor verticalmente no mobile');
});
