import test from 'node:test';
import assert from 'node:assert/strict';

// Mock minimal DOM environment for testing
function setupDomMock({
  userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  standalone = false,
  isIOSStandalone = false
} = {}) {
  const listeners = {};
  const mockNavigator = {
    userAgent,
    platform: userAgent.includes('iPhone') ? 'iPhone' : 'Win32',
    maxTouchPoints: userAgent.includes('iPhone') || userAgent.includes('iPad') ? 5 : 0,
    standalone: isIOSStandalone,
    clipboard: {
      writeText: async () => {}
    }
  };

  class MockNode {}
  global.Node = MockNode;

  class MockElement extends MockNode {
    constructor(tag) {
      super();
      this.tagName = tag.toUpperCase();
      this.className = '';
      this.children = [];
      this.attributes = {};
      this.listeners = {};
    }
    addEventListener(event, fn) {
      this.listeners[event] = this.listeners[event] || [];
      this.listeners[event].push(fn);
    }
    removeEventListener() {}
    setAttribute(k, v) { this.attributes[k] = v; }
    getAttribute(k) { return this.attributes[k]; }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children = items; }
    remove() {}
    showModal() { this.open = true; }
    close() { this.open = false; }
    focus() {}
    getBoundingClientRect() { return { top: 0, left: 0, width: 400, height: 400 }; }
    querySelector() { return null; }
  }

  global.window = {
    addEventListener: (event, fn) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(fn);
    },
    removeEventListener: () => {},
    matchMedia: query => ({
      matches: query.includes('standalone') ? standalone : false
    }),
    navigator: mockNavigator,
    location: {
      href: 'https://app-finc.vercel.app/'
    }
  };

  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: mockNavigator,
      configurable: true,
      writable: true
    });
  } catch {}

  global.document = {
    referrer: '',
    activeElement: null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: tag => new MockElement(tag),
    createElementNS: (ns, tag) => new MockElement(tag),
    createTextNode: text => {
      const node = new MockNode();
      node.text = text;
      return node;
    },
    body: new MockElement('BODY')
  };

  return {
    dispatchWindowEvent: (event, data) => {
      (listeners[event] || []).forEach(fn => fn(data));
    }
  };
}

test('PWA Install: Detecção de plataformas e standalone', async () => {
  // 1. Desktop Chrome
  setupDomMock({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
    standalone: false
  });
  const { detectPlatform, isPwaInstalled } = await import('../app/js/pwa-install.mjs');
  
  let p = detectPlatform();
  assert.equal(p.isDesktop, true);
  assert.equal(p.isIOS, false);
  assert.equal(p.isAndroid, false);
  assert.equal(isPwaInstalled(), false, 'Não deve constar como instalado em aba normal');

  // 2. iPhone Safari
  setupDomMock({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    standalone: false
  });
  p = detectPlatform();
  assert.equal(p.isIOS, true);
  assert.equal(p.isSafari, true);
  assert.equal(p.isDesktop, false);
  assert.equal(isPwaInstalled(), false);

  // 3. iPhone já instalado (standalone = true)
  setupDomMock({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    isIOSStandalone: true
  });
  assert.equal(isPwaInstalled(), true, 'Deve identificar modo standalone no iOS');

  // 4. Android
  setupDomMock({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
  });
  p = detectPlatform();
  assert.equal(p.isAndroid, true);
  assert.equal(p.isIOS, false);
});

test('PWA Install: triggerPwaInstall abre modal no iOS com passos descritivos', async () => {
  setupDomMock({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Safari/604.1'
  });
  const { triggerPwaInstall } = await import('../app/js/pwa-install.mjs');

  let notified = null;
  const mockContext = {
    notify: (msg, tone) => { notified = { msg, tone }; }
  };

  // No iOS sem prompt nativo, abre o modal de instruções
  await triggerPwaInstall(mockContext);
  assert.equal(notified, null, 'No iOS não deve dar erro, e sim abrir o modal instrutivo');
});

test('PWA Install: triggerPwaInstall aciona prompt nativo se disponível (Android/Desktop)', async () => {
  const { dispatchWindowEvent } = setupDomMock({
    userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0'
  });
  const { triggerPwaInstall, setupPwaListeners } = await import('../app/js/pwa-install.mjs');
  setupPwaListeners(global.window);

  let prompted = false;
  let notified = null;
  const mockContext = {
    notify: (msg, tone) => { notified = { msg, tone }; }
  };

  // Simula o disparo de beforeinstallprompt pelo navegador Android
  dispatchWindowEvent('beforeinstallprompt', {
    preventDefault: () => {},
    prompt: async () => { prompted = true; },
    userChoice: Promise.resolve({ outcome: 'accepted' })
  });

  await triggerPwaInstall(mockContext);
  assert.equal(prompted, true, 'Deve chamar o prompt nativo do navegador');
  assert.equal(notified.tone, 'positive');
  assert.ok(notified.msg.includes('instalado com sucesso'));
});
