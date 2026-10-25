import {initialState} from './initial-state.mjs';
import {createStore} from './store.mjs';
import {uid,monthNow,validateTransaction,invoice,invoiceMonth} from './domain.mjs';
import {el,icon,btn,iconBtn,toast,empty,userAvatar} from './ui.mjs';
import {renderOverview,renderAccounts} from './views/overview.mjs';
import {renderTransactions,transactionForm} from './views/transactions.mjs';
import {renderCards} from './views/cards.mjs';
import {renderGoals} from './views/goals.mjs';
import {renderSettings,renderDemoEntry} from './views/settings.mjs';
import {renderSidebarAssistant} from './views/sidebar-assistant.mjs';
import {getSupabaseClient} from './supabase.mjs';
import {initSyncManager} from './sync.mjs';

let storage;
try {
  storage = window.localStorage;
} catch {
  storage = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } };
}

const client = getSupabaseClient();
const store = createStore(storage, initialState(), client?.getUser());
const syncManager = initSyncManager(store, client, storage);
let month = monthNow();

const nav = [
  ['overview', 'Visão geral', 'dashboard'],
  ['accounts', 'Contas', 'wallet'],
  ['cards', 'Cartões', 'card'],
  ['transactions', 'Transações', 'arrows'],
  ['goals', 'Metas', 'target'],
  ['settings', 'Configurações', 'settings']
];

const views = {
  overview: renderOverview,
  accounts: renderAccounts,
  cards: renderCards,
  transactions: renderTransactions,
  goals: renderGoals,
  settings: renderSettings,
  login: renderDemoEntry,
  signup: renderDemoEntry,
  'forgot-password': renderDemoEntry,
  'update-password': renderDemoEntry
};

const AUTH_ROUTES = ['login', 'signup', 'forgot-password', 'update-password'];

function handleAuthHash() {
  const hash = location.hash.slice(1);
  if (!hash) return null;
  if (hash.includes('access_token=') && hash.includes('type=recovery')) {
    try {
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const expiresIn = Number(params.get('expires_in')) || 3600;
      if (accessToken) {
        let user = null;
        try {
          const payloadBase64 = accessToken.split('.')[1];
          const payloadJson = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
          const jwtPayload = JSON.parse(payloadJson);
          user = { id: jwtPayload.sub, email: jwtPayload.email, user_metadata: jwtPayload.user_metadata || {} };
        } catch {}
        client.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: Math.floor(Date.now() / 1000) + expiresIn,
          user
        });
        location.hash = '#update-password';
        return 'update-password';
      }
    } catch {}
  }
  return null;
}

const route = () => {
  const intercepted = handleAuthHash();
  if (intercepted) return intercepted;
  const user = client?.getUser();
  const r = location.hash.slice(1);
  if (!user) {
    return AUTH_ROUTES.includes(r) ? r : 'login';
  }
  if (r === 'family') return 'overview';
  if (r === 'planning') return 'goals';
  if (AUTH_ROUTES.includes(r)) return 'overview';
  return r || 'overview';
};

function persist(state) {
  const result = store.save(state);
  if (!result.ok) throw Error(result.error);
  render();
  const user = client.getUser();
  if (user) {
    toast('Alteração salva localmente e enviada para a nuvem privada.');
  } else {
    toast('Alteração salva neste navegador.');
  }
  return true;
}

function dispatch(action, payload) {
  const user = client?.getUser();
  if (!user) {
    throw Error('É necessário entrar em sua conta para realizar alterações financeiras.');
  }
  const s = store.getState();
  const upsert = (list, value) => {
    const id = value.id || uid();
    const index = list.findIndex(i => i.id === id);
    if (index >= 0) list[index] = { ...value, id };
    else list.push({ ...value, id });
  };

  if (action === 'saveTransaction') {
    const errors = validateTransaction(s, payload);
    if (errors.length) throw Error(errors.join('\n'));
    upsert(s.transactions, payload);
  } else if (action === 'deleteTransaction') {
    s.transactions = s.transactions.filter(t => t.id !== payload);
  } else if (action === 'saveAccount') {
    upsert(s.accounts, payload);
  } else if (action === 'deleteAccount') {
    s.accounts = s.accounts.filter(a => a.id !== payload);
  } else if (action === 'saveCard') {
    upsert(s.cards, payload);
  } else if (action === 'deleteCard') {
    s.cards = s.cards.filter(a => a.id !== payload);
  } else if (action === 'saveGoal') {
    upsert(s.goals, payload);
  } else if (action === 'deleteGoal') {
    s.goals = s.goals.filter(g => g.id !== payload);
    s.contributions = s.contributions.filter(g => g.goalId !== payload);
  } else if (action === 'contribute') {
    upsert(s.contributions, payload);
  } else if (action === 'deleteContribution') {
    s.contributions = s.contributions.filter(c => c.id !== payload);
  } else if (action === 'preferences') {
    s.preferences = { ...s.preferences, ...payload };
  } else if (action === 'importState') {
    const r = store.reset(payload);
    if (!r.ok) throw Error(r.error);
    render();
    toast('Backup restaurado com sucesso.');
    return true;
  } else if (action === 'reset') {
    const r = store.reset(initialState());
    if (!r.ok) throw Error(r.error);
    render();
    toast('Seu espaço financeiro foi zerado.');
    return true;
  } else {
    throw Error('Ação desconhecida.');
  }

  for (const card of s.cards) {
    const months = new Set(s.transactions.filter(t => t.cardId === card.id).map(t => t.type === 'cardPayment' ? t.invoiceMonth : invoiceMonth(card, t.date)));
    for (const m of months) {
      if (invoice(s, card.id, m).dueCents < 0) {
        throw Error('Esta alteração deixaria uma fatura paga além do total. Ajuste o pagamento primeiro.');
      }
    }
  }

  // Queue mutation for remote PostgREST synchronization
  syncManager.queueMutation(action, payload);

  return persist(s);
}

function navigate(r) {
  location.hash = r;
}

function render() {
  const user = client.getUser();
  const r = route();

  if (!user) {
    // Modo não autenticado: login obrigatório, sem exibir ou permitir editar finanças locais
    document.documentElement.dataset.theme = 'dark';
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.content = '#000000';

    const c = {
      state: initialState(),
      month,
      dispatch: () => { throw Error('Faça login para continuar.'); },
      navigate,
      notify: toast,
      route: r,
      user: null,
      syncStatus: 'local',
      openTransaction: () => toast('Faça login para adicionar transações.', 'error'),
      period: () => el('div', { class: 'hide' })
    };

    let content;
    try {
      content = (views[r] || renderDemoEntry)(c);
    } catch (e) {
      content = empty('Não foi possível exibir esta área', e.message);
    }

    const authScreen = el('div', { class: 'auth-screen' }, [
      el('div', { class: 'auth-card-wrap' }, [content])
    ]);

    document.getElementById('app').replaceChildren(authScreen);
    const authTitles = {
      login: 'Entrar',
      signup: 'Cadastro',
      'forgot-password': 'Recuperar Acesso',
      'update-password': 'Definir Nova Senha'
    };
    document.title = (authTitles[r] || 'Acesso') + ' · Finance OS';
    return;
  }

  // --- Modo autenticado: usuário com sessão válida ---
  const state = store.getState();
  const syncStatus = syncManager.getStatus();

  const theme = state.preferences.theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.content = theme === 'light' ? '#f6f8fa' : '#000000';

  const c = {
    state,
    month,
    dispatch,
    navigate,
    notify: toast,
    route: r,
    user,
    syncStatus,
    renderImportConsent: () => {
      if (!syncManager?.hasVisitorData()) return null;
      if (typeof window !== 'undefined' && window.sessionStorage?.getItem('finance-os:dismiss-import')) return null;

      const visitor = syncManager.getVisitorData();
      const txCount = visitor?.transactions?.length || 0;
      const accCount = visitor?.accounts?.length || 0;
      const goalCount = visitor?.goals?.length || 0;

      return el('div', { class: 'notice info import-consent-notice', style: 'margin-bottom: 24px; border-left: 3px solid var(--accent);' }, [
        el('div', { class: 'import-consent-header' }, [
          el('strong', { style: 'font-size: 13px; color: var(--accent); display: block; margin-bottom: 4px;' }, 'Dados financeiros locais encontrados neste dispositivo'),
          el('p', { style: 'margin: 0 0 12px; font-size: 12px; line-height: 1.6;' },
            `Encontramos ${accCount} conta(s), ${txCount} transação(ões) e ${goalCount} meta(s) salvas localmente antes do login. Deseja importá-los para sua conta privada no Supabase com validação atômica?`
          )
        ]),
        el('div', { class: 'actions' }, [
          btn('Sim, importar para minha conta', async () => {
            try {
              toast('Importando e validando seus dados locais com o Supabase...');
              const res = await syncManager.performAssistedImport();
              try {
                storage.setItem('finance-os:imported-archive:v1', JSON.stringify(visitor));
                storage.removeItem('finance-os:personal:v1');
              } catch {}
              toast(`Importação concluída com sucesso! ${res?.counts?.transactions ?? txCount} lançamentos sincronizados.`);
              render();
            } catch (err) {
              toast(err.message, 'error');
            }
          }, 'primary', 'download'),
          btn('Não, manter conta limpa', () => {
            if (typeof window !== 'undefined' && window.sessionStorage) {
              window.sessionStorage.setItem('finance-os:dismiss-import', '1');
            }
            toast('Dados locais preservados no navegador como cópia de segurança.');
            render();
          }, 'ghost')
        ])
      ]);
    },
    openTransaction: (t = null, accountId = null) => transactionForm(c, t, accountId),
    period: () => el('label', { class: 'period' }, [
      el('span', { class: 'hide' }, 'Mês de referência'),
      el('input', {
        type: 'month',
        value: month,
        'aria-label': 'Mês de referência',
        onChange: e => {
          if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) {
            month = e.target.value;
            render();
          }
        }
      })
    ])
  };

  const brand = cls => el('a', { href: '#overview', class: 'brand ' + (cls || ''), 'aria-label': 'Finance OS, início' }, [
    el('div', { class: 'brand-mark' }, 'f'),
    el('div', {}, ['finance', el('span', {}, 'os')])
  ]);

  const navLink = ([id, label, ico]) => el('a', {
    href: '#' + id,
    class: r === id ? 'active' : '',
    'aria-label': label,
    'aria-current': r === id ? 'page' : null
  }, [
    icon(ico),
    el('span', {}, label)
  ]);

  const triggerAssistant = async (prefill = '') => {
    try {
      const { openAssistant } = await import('./views/assistant.mjs');
      const dialog = openAssistant({ ...c, state: store.getState(), month });
      if (prefill && dialog) {
        const textarea = dialog.querySelector('textarea');
        if (textarea) {
          textarea.value = prefill;
          dialog.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      }
    } catch {
      toast('Não foi possível abrir o assistente.', 'error');
    }
  };

  const assistantSidebarCard = renderSidebarAssistant(c);
  const sidebar = el('aside', { class: 'sidebar' }, [
    brand(),
    el('p', { class: 'nav-label' }, 'PRINCIPAL'),
    el('nav', { class: 'nav', 'aria-label': 'Navegação principal' }, nav.filter(([id]) => id !== 'settings').map(navLink)),
    el('div', { class: 'sidebar-bottom' }, [assistantSidebarCard])
  ]);

  const title = nav.find(n => n[0] === r)?.[1] || (r === 'login' ? 'Entrar' : r === 'signup' ? 'Cadastro' : 'Bem-vindo');

  // Cloud status badge in Topbar
  let cloudBadge;
  if (!user) {
    cloudBadge = el('a', { href: '#login', class: 'demo-badge', title: 'Modo local no navegador. Clique para entrar com sua conta.' }, 'MODO LOCAL');
  } else {
    const badgeLabels = {
      synced: 'NUVEM PRIVADA',
      syncing: 'SINCRONIZANDO...',
      pending: 'PENDENTE',
      offline: 'MODO OFFLINE',
      error: 'ERRO NUVEM'
    };
    cloudBadge = el('a', {
      href: '#settings',
      class: `demo-badge cloud-badge ${syncStatus}`,
      title: `Conectado como ${user.email} (${badgeLabels[syncStatus] || 'Conectado'})`
    }, badgeLabels[syncStatus] || 'CONECTADO');
  }

  const top = el('header', { class: 'topbar' }, [
    el('div', { class: 'breadcrumb' }, [
      icon('home'),
      el('span', {}, '/'),
      el('strong', {}, title)
    ]),
    brand('mobile-brand'),
    el('div', { class: 'top-actions' }, [
      cloudBadge,
      el('button', {
        type: 'button',
        class: 'btn ghost assistant-trigger',
        'aria-label': 'Falar lançamento por voz ou texto',
        title: 'Falar lançamento (Entrada ou Saída)',
        onClick: () => triggerAssistant()
      }, [
        icon('mic'),
        el('span', {}, 'Falar lançamento')
      ]),
      iconBtn(theme === 'dark' ? 'sun' : 'moon', theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro', () => {
        try { dispatch('preferences', { theme: theme === 'dark' ? 'light' : 'dark' }); }
        catch (e) { toast(e.message, 'error'); }
      }),
      iconBtn('eye', state.preferences.hideAmounts ? 'Mostrar valores' : 'Ocultar valores', () => {
        try { dispatch('preferences', { hideAmounts: !state.preferences.hideAmounts }); }
        catch (e) { toast(e.message, 'error'); }
      }),
      el('a', { href: user ? '#settings' : '#login', class: 'top-profile', 'aria-label': user ? 'Configurações e Perfil' : 'Entrar' }, userAvatar(state.preferences))
    ])
  ]);

  let content;
  try {
    content = (views[r] || (() => empty('Página não encontrada', 'Use a navegação para continuar.')))(c);
  } catch (e) {
    content = empty('Não foi possível exibir esta área', e.message);
  }

  // Footer status indicator
  let bottomNote;
  if (!user) {
    bottomNote = el('footer', { class: 'bottom-note' }, [
      el('span', {}, [el('i', { class: 'status-dot' }), 'Dados salvos apenas neste navegador']),
      el('span', {}, 'Feito para os seus próximos passos.')
    ]);
  } else {
    const dotClass = syncStatus === 'synced' ? 'green' : syncStatus === 'syncing' ? 'yellow' : 'orange';
    const statusMsg = {
      synced: 'Sincronizado com a nuvem privada',
      syncing: 'Sincronizando com a nuvem...',
      pending: 'Alterações pendentes de sincronização',
      offline: 'Modo offline (dados preservados localmente)',
      error: 'Erro na conexão com a nuvem'
    }[syncStatus] || 'Conectado';

    bottomNote = el('footer', { class: 'bottom-note' }, [
      el('span', {}, [el('i', { class: `status-dot ${dotClass}` }), statusMsg]),
      el('span', {}, user.email)
    ]);
  }

  const main = el('main', { class: 'main', id: 'main', tabindex: '-1' }, [
    store.error && el('div', { class: 'notice warning', role: 'alert' }, store.error),
    content,
    bottomNote
  ]);

  const mobileLabels = { overview: 'Início', accounts: 'Contas', cards: 'Cartões', transactions: 'Extrato', goals: 'Metas', settings: 'Ajustes' };
  const mobile = el('nav', { class: 'mobile-nav', 'aria-label': 'Navegação mobile' }, nav.map(([id, label, ico]) => navLink([id, mobileLabels[id] || label, ico])));

  document.getElementById('app').replaceChildren(sidebar, el('div', { class: 'shell'}, [top, main]), mobile);
  document.title = title + ' · Finance OS';
}

// React to sync status changes and store updates
syncManager.subscribeStatus(() => { render(); });
store.subscribe(() => { render(); });

document.addEventListener('click', e => {
  const menu = document.querySelector('.workspace-menu[open]');
  if (menu && !menu.contains(e.target)) menu.open = false;
});

document.querySelector('.skip')?.addEventListener('click', e => {
  e.preventDefault();
  document.getElementById('main').focus();
});

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
  document.getElementById('main').focus({ preventScroll: true });
});

render();
