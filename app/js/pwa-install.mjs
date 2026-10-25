/**
 * Finance OS — PWA Install Module
 * Suporte nativo para instalação em Android, iOS (iPhone/iPad) e Desktop.
 */

import { el, btn, icon, iconBtn, restoreFocus } from './ui.mjs';

let deferredInstallPrompt = null;
const installListeners = new Set();

// Captura global do evento beforeinstallprompt
export function setupPwaListeners(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return;
  win.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    notifyInstallState();
  });

  win.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    notifyInstallState();
  });
}

export function setDeferredPrompt(prompt) {
  deferredInstallPrompt = prompt;
  notifyInstallState();
}

if (typeof window !== 'undefined') {
  setupPwaListeners(window);
}

function notifyInstallState() {
  const installed = isPwaInstalled();
  const canPrompt = !!deferredInstallPrompt;
  installListeners.forEach(fn => {
    try { fn({ installed, canPrompt }); } catch {}
  });
}

/**
 * Detecta se o aplicativo já está aberto em modo instalado (Standalone/PWA)
 */
export function isPwaInstalled() {
  if (typeof window === 'undefined') return false;
  try {
    const isStandaloneDisplay = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    const isFullscreenDisplay = window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches;
    const isIOSStandalone = window.navigator && window.navigator.standalone === true;
    const isAndroidApp = typeof document !== 'undefined' && document.referrer && document.referrer.includes('android-app://');
    return Boolean(isStandaloneDisplay || isFullscreenDisplay || isIOSStandalone || isAndroidApp);
  } catch {
    return false;
  }
}

/**
 * Detecta a plataforma e o navegador do usuário
 */
export function detectPlatform() {
  if (typeof navigator === 'undefined') {
    return { isIOS: false, isAndroid: false, isSafari: false, isChrome: false, isDesktop: true };
  }
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  // Safari no iOS ou macOS (sem conter chrome, crios, android ou fxios)
  const isSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);
  const isChrome = /Chrome|CriOS/i.test(ua);
  const isDesktop = !isIOS && !isAndroid;

  return { isIOS, isAndroid, isSafari, isChrome, isDesktop };
}

/**
 * Permite que componentes escutem alterações de disponibilidade de instalação
 */
export function onInstallAvailabilityChange(fn) {
  installListeners.add(fn);
  return () => installListeners.delete(fn);
}

/**
 * Inicia o fluxo de instalação ou abre as instruções apropriadas para a plataforma
 */
export async function triggerPwaInstall(c) {
  if (isPwaInstalled()) {
    c.notify('O Finance OS já está instalado como aplicativo neste aparelho.', 'positive');
    return;
  }

  // 1. Caso o navegador suporte o prompt nativo imediato (Android Chrome, Edge, etc.)
  if (deferredInstallPrompt) {
    try {
      await deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice && choice.outcome === 'accepted') {
        c.notify('Aplicativo instalado com sucesso! Abra o Finance OS na sua tela inicial.', 'positive');
        deferredInstallPrompt = null;
        notifyInstallState();
        return;
      } else {
        c.notify('Instalação cancelada. Você pode instalar quando quiser pelo mesmo botão.', 'info');
        return;
      }
    } catch {
      // Se falhar o prompt nativo, abre o modal instrutivo
    }
  }

  // 2. Se for iOS, ou navegador sem prompt automático ativo, abre instruções passo a passo
  openPwaInstallModal(c);
}

/**
 * Modal acessível com instruções de instalação adaptadas por plataforma
 */
export function openPwaInstallModal(c) {
  const existing = document.querySelector('.pwa-install-dialog');
  if (existing) existing.remove();

  const last = document.activeElement;
  const platform = detectPlatform();
  const dialog = el('dialog', {
    class: 'dialog pwa-install-dialog',
    'aria-labelledby': 'pwa-dialog-title',
    'aria-modal': 'true'
  });

  const close = () => {
    if (dialog.open) dialog.close();
    dialog.remove();
    restoreFocus(last);
  };

  dialog.addEventListener('cancel', e => {
    e.preventDefault();
    close();
  });

  // Fechar ao clicar no backdrop escuro
  dialog.addEventListener('click', e => {
    const rect = dialog.getBoundingClientRect();
    const isInDialog = (
      rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX && e.clientX <= rect.left + rect.width
    );
    if (!isInDialog) close();
  });

  let platformBadge = 'Computador';
  let steps = [];
  let extraContent = null;

  if (platform.isIOS) {
    platformBadge = 'iPhone / iPad (iOS)';
    
    // Se o usuário está no iOS mas não no Safari
    if (!platform.isSafari) {
      extraContent = el('div', { class: 'notice warning', style: 'margin-bottom:16px' }, [
        el('strong', {}, 'Abra no Safari: '),
        'A Apple só permite adicionar à tela de início pelo navegador Safari.',
        el('div', { style: 'margin-top:10px' }, [
          btn('Copiar link do Finance OS', async () => {
            try {
              const url = window.location.href;
              await navigator.clipboard.writeText(url);
              c.notify('Link copiado! Abra o Safari e cole o endereço.', 'positive');
            } catch {
              c.notify('Endereço: ' + window.location.href, 'info');
            }
          }, 'ghost', 'note')
        ])
      ]);
    }

    steps = [
      {
        num: '1',
        title: 'Toque em Compartilhar',
        desc: 'No Safari, toque no botão Compartilhar (o ícone de quadrado com a seta para cima na barra inferior).'
      },
      {
        num: '2',
        title: 'Adicionar à Tela de Início',
        desc: 'Role a lista de ações para baixo e selecione a opção "Adicionar à Tela de Início".'
      },
      {
        num: '3',
        title: 'Toque em Adicionar',
        desc: 'No canto superior direito, toque em "Adicionar" para confirmar o ícone do Finance OS.'
      }
    ];
  } else if (platform.isAndroid) {
    platformBadge = 'Android';
    steps = [
      {
        num: '1',
        title: 'Menu do navegador',
        desc: 'Toque nos três pontinhos (⋮) no canto superior direito do seu navegador (Chrome, Edge ou Brave).'
      },
      {
        num: '2',
        title: 'Instalar aplicativo',
        desc: 'Toque na opção "Instalar aplicativo" ou "Adicionar à tela inicial".'
      },
      {
        num: '3',
        title: 'Confirmar instalação',
        desc: 'Toque em "Instalar" para que o app funcione em tela cheia com ícone nativo.'
      }
    ];
  } else {
    platformBadge = 'Computador (Desktop)';
    steps = [
      {
        num: '1',
        title: 'Barra de endereços',
        desc: 'No Chrome ou Edge, clique no ícone de instalação (computador com uma seta para baixo) no lado direito da barra de endereços.'
      },
      {
        num: '2',
        title: 'Ou pelo menu',
        desc: 'Clique nos três pontinhos (⋮) no topo do navegador e selecione "Instalar Finance OS".'
      },
      {
        num: '3',
        title: 'No Mac com Safari',
        desc: 'Se estiver no Safari do macOS, clique no menu superior Arquivo > "Adicionar ao Dock".'
      }
    ];
  }

  const stepsList = el('div', { class: 'pwa-steps-list' }, steps.map(s => (
    el('div', { class: 'pwa-step-item' }, [
      el('span', { class: 'pwa-step-num' }, s.num),
      el('div', { class: 'pwa-step-body' }, [
        el('strong', { class: 'pwa-step-title' }, s.title),
        el('p', { class: 'pwa-step-desc' }, s.desc)
      ])
    ])
  )));

  const dialogHead = el('div', { class: 'dialog-head' }, [
    el('div', {}, [
      el('div', { class: 'pwa-eyebrow' }, [
        icon('download'),
        el('span', {}, 'INSTALAR APLICATIVO'),
        el('span', { class: 'pwa-platform-tag' }, platformBadge)
      ]),
      el('h2', { id: 'pwa-dialog-title' }, 'Finance OS no seu aparelho')
    ]),
    iconBtn('close', 'Fechar', close)
  ]);

  const dialogBody = el('div', { class: 'pwa-dialog-content' }, [
    el('p', { class: 'secondary', style: 'margin-bottom:16px' }, 
      'Instale o Finance OS para abrir rápido direto da sua tela inicial ou desktop, com visual limpo e sem a barra do navegador.'
    ),
    extraContent,
    stepsList,
    el('div', { class: 'notice info', style: 'margin-top:16px' }, [
      el('strong', {}, '100% Privado e Seguro: '),
      'O aplicativo continuará funcionando com criptografia, isolamento e sem consumir memória extra.'
    ])
  ]);

  const dialogActions = el('div', { class: 'dialog-actions' }, [
    btn('Entendi', close, 'primary', 'check')
  ]);

  dialog.append(dialogHead, dialogBody, dialogActions);
  document.body.append(dialog);
  dialog.showModal();

  // Foco no botão de confirmação para acessibilidade
  const primaryBtn = dialog.querySelector('.dialog-actions .btn.primary');
  if (primaryBtn) primaryBtn.focus();

  return dialog;
}
