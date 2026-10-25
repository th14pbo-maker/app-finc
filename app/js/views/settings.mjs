import {exportBackup,parseBackup,BACKUP_MAX_BYTES} from '../backup.mjs';
import {profileForm} from './profile.mjs';
import {el,icon,btn,header,panel,panelHead,field,openDialog,confirmDialog,runAction,userAvatar} from '../ui.mjs';
import {getSupabaseClient} from '../supabase.mjs';
import {getSyncManager} from '../sync.mjs';
import {getSupabaseConfig,saveSupabaseConfig} from '../supabase-config.mjs';
import {isPwaInstalled,triggerPwaInstall,onInstallAvailabilityChange} from '../pwa-install.mjs';

export function renderSettings(c) {
  const profile = profileForm(c);
  const syncManager = getSyncManager();
  const client = getSupabaseClient();
  const user = client?.getUser();
  const status = syncManager?.getStatus() || 'local';

  // 1. Painel de Nuvem e Autenticação Supabase
  let accountPanel;
  if (user) {
    const statusText = {
      synced: 'Sincronizado com a nuvem privada',
      syncing: 'Sincronizando com a nuvem...',
      pending: 'Alterações pendentes de sincronização',
      offline: 'Modo offline (dados preservados localmente)',
      error: 'Erro na conexão com a nuvem'
    }[status] || 'Conectado';

    const statusClass = status === 'synced' ? 'status-synced' : status === 'syncing' ? 'status-syncing' : 'status-pending';

    const assistedImportAction = syncManager?.hasVisitorData()
      ? el('div', { class: 'notice info', style: 'margin-top:16px' }, [
          el('strong', {}, 'Dados de visitante encontrados: '),
          'Existem dados financeiros salvos antes do login. Deseja importá-los para sua conta privada com validação atômica?',
          el('div', { class: 'actions', style: 'margin-top:8px' }, [
            btn('Importar dados locais para a conta', async () => {
              try {
                c.notify('Importando e validando dados na nuvem...');
                const res = await syncManager.performAssistedImport();
                c.notify(`Importação concluída! ${res.counts.transactions} lançamentos sincronizados.`);
                location.hash = '#overview';
              } catch (err) {
                c.notify(err.message, 'error');
              }
            }, 'primary', 'download'),
            btn('Descartar dados locais', () => {
              confirmDialog('Descartar dados de visitante?', 'Os dados locais não vinculados serão removidos deste dispositivo.', () => {
                syncManager?.clearVisitorData();
                c.notify('Dados locais de visitante removidos.');
                location.reload();
              });
            }, 'ghost')
          ])
        ])
      : null;

    accountPanel = panel([
      panelHead('Sua Conta e Nuvem Privada', 'Acesso individual exclusivo da família.'),
      el('div', { class: 'account-info' }, [
        el('p', {}, [el('strong', {}, 'E-mail: '), user.email]),
        el('p', { class: `sync-status-indicator ${statusClass}`, style: 'margin-top:4px' }, [
          el('i', { class: 'status-dot' }),
          el('span', {}, statusText)
        ])
      ]),
      assistedImportAction,
      el('div', { class: 'actions', style: 'margin-top:16px' }, [
        btn('Sair da conta', async () => {
          confirmDialog('Encerrar sessão?', 'Seus dados privados serão limpos da tela e o aplicativo voltará ao login com segurança.', async () => {
            await client.signOut();
            c.notify('Sessão encerrada com segurança.');
            c.navigate('login');
          });
        }, 'danger', 'log-out')
      ])
    ], 'settings-section');
  } else {
    accountPanel = panel([
      panelHead('Conta e Acesso Privado', 'Entre para manter suas finanças privadas sincronizadas.'),
      el('p', { class: 'small muted' }, 'Você está no Modo Visitante. Seus dados estão salvos apenas neste navegador.'),
      el('div', { class: 'actions', style: 'margin-top:16px' }, [
        btn('Entrar na minha conta', () => c.navigate('login'), 'primary', 'log-in'),
        btn('Cadastrar nova conta', () => c.navigate('signup'), 'ghost')
      ])
    ], 'settings-section');
  }

  // 2. Painel de Backup JSON
  const backupFile = el('input', { type: 'file', accept: '.json,application/json', class: 'hide', 'aria-label': 'Escolher backup completo' });
  backupFile.addEventListener('change', async () => {
    const file = backupFile.files?.[0];
    if (!file) return;
    try {
      if (file.size > BACKUP_MAX_BYTES) throw Error('Escolha um backup de até 8 MB.');
      const next = parseBackup(await file.text());
      confirmDialog(
        'Restaurar backup completo?',
        `Este backup contém ${next.accounts.length} contas, ${next.cards.length} cartões, ${next.transactions.length} transações e ${next.goals.length} metas. Ele substituirá os dados locais atuais. Exporte um backup antes de continuar.`,
        () => c.dispatch('importState', next)
      );
    } catch (e) {
      c.notify(e.message, 'error');
    } finally {
      backupFile.value = '';
    }
  });

  const backupPanel = panel([
    panelHead('Backup e transferência', 'Leve seus dados para outro navegador ou guarde uma cópia privada.'),
    el('p', { class: 'small muted' }, 'O backup JSON inclui contas, cartões, lançamentos, metas, aportes e perfil. Guarde-o em local seguro: ele contém seus dados e não é criptografado.'),
    el('div', { class: 'actions', style: 'margin-top:16px' }, [
      btn('Baixar backup completo', () => runAction(() => {
        const url = URL.createObjectURL(new Blob([exportBackup(c.state)], { type: 'application/json' }));
        const a = el('a', { href: url, download: 'finance-os-backup-' + new Date().toISOString().slice(0, 10) + '.json' });
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, c.notify), '', 'download'),
      btn('Restaurar backup', () => backupFile.click()),
      backupFile
    ])
  ], 'settings-section');

  // 3. Painel de Configuração de Servidor Supabase
  const config = getSupabaseConfig();
  const configPanel = panel([
    panelHead('Conexão Supabase', 'Servidor de banco de dados e autenticação.'),
    el('p', { class: 'small muted' }, `URL atual: ${config.url}`),
    el('div', { class: 'actions', style: 'margin-top:12px' }, [
      btn('Configurar credenciais da nuvem', () => {
        const urlInput = field('URL do Projeto Supabase', 'url', 'url', config.url);
        const keyInput = field('Anon Public Key', 'anonKey', 'text', config.anonKey);
        const form = el('form', {}, [
          urlInput,
          keyInput,
          el('div', { class: 'actions', style: 'margin-top:16px' }, [
            el('button', { class: 'btn primary', type: 'submit' }, 'Salvar configurações')
          ])
        ]);
        const dialog = openDialog('Configuração Supabase', [form]);
        form.addEventListener('submit', e => {
          e.preventDefault();
          const fd = new FormData(form);
          const newUrl = fd.get('url').trim();
          const newKey = fd.get('anonKey').trim();
          if (!newUrl) return;
          saveSupabaseConfig({ url: newUrl, anonKey: newKey });
          c.notify('Configuração salva. Recarregando conexão...');
          dialog.close();
          setTimeout(() => location.reload(), 300);
        });
      }, 'ghost')
    ])
  ], 'settings-section');

  return el('div', {}, [
    header('Seu espaço, do seu jeito.', 'Preferências, privacidade e seus dados financeiros.'),
    el('div', { class: 'settings' }, [
      accountPanel,
      backupPanel,
      panel([panelHead('Seu perfil', 'Personalize seu espaço financeiro.'), profile], 'settings-section'),
      panel([panelHead('Aparência', 'Escolha o tema que fica mais confortável para você.'),
        el('div', { class: 'actions', 'aria-label': 'Tema' }, [['dark', 'Modo escuro', 'moon'], ['light', 'Modo claro', 'sun']].map(([theme, label, ico]) => {
          const b = btn(label, () => runAction(() => c.dispatch('preferences', { theme }), c.notify), (c.state.preferences.theme || 'dark') === theme ? 'primary' : '', ico);
          b.setAttribute('aria-pressed', String((c.state.preferences.theme || 'dark') === theme));
          return b;
        }))
      ], 'settings-section'),
      panel([panelHead('Privacidade visual', 'Controle como seus valores aparecem na tela.'),
        btn(c.state.preferences.hideAmounts ? 'Mostrar valores' : 'Ocultar valores', () => runAction(() => c.dispatch('preferences', { hideAmounts: !c.state.preferences.hideAmounts }), c.notify), '', 'eye'),
        el('p', { class: 'small muted', style: 'margin-top:16px' }, 'Ocultar valores não é criptografia. Os dados continuam disponíveis neste navegador.')
      ], 'settings-section'),
      configPanel,
      !isPwaInstalled() ? panel([
        panelHead('Aplicativo na tela inicial', 'Acesse o Finance OS como aplicativo nativo.'),
        el('p', { class: 'small muted' }, 'Instale no seu celular ou computador para abrir direto da sua tela inicial ou desktop, sem a barra do navegador.'),
        el('div', { class: 'actions', style: 'margin-top:16px' }, [
          btn('Instalar aplicativo', () => triggerPwaInstall(c), 'primary', 'download')
        ])
      ], 'settings-section') : null,
      panel([panelHead('Dados locais', 'Gerenciamento do espaço local.'),
        el('p', { class: 'small muted' }, 'Seus lançamentos ficam salvos localmente. Limpar os dados do site remove esses registros.'),
        el('div', { class: 'actions', style: 'margin-top:20px' }, [
          btn('Zerar dados financeiros', () => confirmDialog('Começar do zero?', 'Todas as contas, cartões, transações, metas e pessoas cadastradas serão removidas deste espaço. Esta ação não pode ser desfeita.', () => c.dispatch('reset')), 'danger')
        ])
      ], 'settings-section')
    ])
  ]);
}

/**
 * Visual completo de Autenticação: Login, Cadastro de Convidados e Recuperação de Senha
 */
export function renderDemoEntry(c) {
  const route = c.route;
  const client = getSupabaseClient();

  const brandHeader = el('div', { class: 'brand' }, [
    el('div', { class: 'brand-mark' }, 'f'),
    el('div', {}, 'financeos')
  ]);

  if (route === 'signup') {
    // -------------------------------------------------------------
    // TELA DE CADASTRO (Restrito aos e-mails autorizados)
    // -------------------------------------------------------------
    const nameInput = field('Seu nome completo', 'displayName', 'text', '');
    const emailInput = field('Seu e-mail', 'email', 'email', '');
    const passInput = field('Senha (mínimo 6 caracteres)', 'password', 'password', '');
    const pass2Input = field('Confirmar senha', 'passwordConfirm', 'password', '');

    const notice = el('div', { class: 'notice info', style: 'margin-bottom:16px' }, [
      el('strong', {}, 'Privacidade total: '),
      'Cada pessoa tem seu próprio login e suas finanças 100% privadas e isoladas.'
    ]);

    const submitBtn = el('button', { class: 'btn primary', type: 'submit' }, 'Criar minha conta');
    const form = el('form', {}, [
      notice,
      nameInput,
      emailInput,
      passInput,
      pass2Input,
      submitBtn
    ]);

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (submitBtn.disabled) return;
      const fd = new FormData(form);
      const displayName = fd.get('displayName').trim();
      const email = fd.get('email').trim();
      const password = fd.get('password');
      const passwordConfirm = fd.get('passwordConfirm');

      if (!displayName) { c.notify('Informe seu nome.', 'error'); return; }
      if (!email) { c.notify('Informe seu e-mail.', 'error'); return; }
      if (!password || password.length < 6) { c.notify('A senha deve ter no mínimo 6 caracteres.', 'error'); return; }
      if (password !== passwordConfirm) { c.notify('As senhas não coincidem.', 'error'); return; }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Criando sua conta...';

      try {
        const res = await client.signUp({ email, password, displayName });
        if (res?.session) {
          c.notify('Cadastro realizado com sucesso! Bem-vindo ao Finance OS.');
          c.navigate('overview');
        } else {
          c.notify('Cadastro iniciado! Enviamos um link de confirmação para o seu e-mail. Verifique sua caixa de entrada e pasta de spam para liberar seu acesso antes de entrar.', 'info');
          c.navigate('login');
        }
      } catch (err) {
        c.notify(err.message, 'error');
        if (err.message.includes('Limite temporário') || err.message.toLowerCase().includes('rate limit')) {
          let remaining = 60;
          submitBtn.disabled = true;
          submitBtn.textContent = `Aguarde ${remaining}s...`;
          const timer = setInterval(() => {
            remaining -= 1;
            if (remaining > 0) {
              submitBtn.textContent = `Aguarde ${remaining}s...`;
            } else {
              clearInterval(timer);
              submitBtn.disabled = false;
              submitBtn.textContent = 'Criar minha conta';
            }
          }, 1000);
        } else {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Criar minha conta';
        }
      }
    });

    return el('div', { class: 'auth' }, [
      brandHeader,
      el('h1', {}, 'Seu futuro começa aqui.'),
      el('p', { class: 'muted' }, 'Crie seu espaço particular na nuvem privada da família.'),
      panel([
        form,
        el('div', { class: 'subtle-divider' }),
        el('div', { class: 'actions' }, [
          btn('Já tem uma conta? Entrar', () => c.navigate('login'), 'ghost')
        ])
      ])
    ]);
  }

  if (route === 'forgot-password') {
    // -------------------------------------------------------------
    // RECUPERAÇÃO DE SENHA
    // -------------------------------------------------------------
    const emailInput = field('E-mail cadastrado', 'email', 'email', '');
    const submitBtn = el('button', { class: 'btn primary', type: 'submit' }, 'Enviar link de recuperação');
    const form = el('form', {}, [emailInput, submitBtn]);

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (submitBtn.disabled) return;
      const email = new FormData(form).get('email').trim();
      if (!email) { c.notify('Informe seu e-mail.', 'error'); return; }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';

      try {
        await client.resetPasswordForEmail(email);
        c.notify('Instruções enviadas para seu e-mail! Verifique sua caixa de entrada e pasta de spam.');
        c.navigate('login');
      } catch (err) {
        c.notify(err.message, 'error');
        if (err.message.includes('Limite') || err.message.toLowerCase().includes('rate limit')) {
          let remaining = 60;
          submitBtn.disabled = true;
          submitBtn.textContent = `Aguarde ${remaining}s...`;
          const timer = setInterval(() => {
            remaining -= 1;
            if (remaining > 0) {
              submitBtn.textContent = `Aguarde ${remaining}s...`;
            } else {
              clearInterval(timer);
              submitBtn.disabled = false;
              submitBtn.textContent = 'Enviar link de recuperação';
            }
          }, 1000);
        } else {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Enviar link de recuperação';
        }
      }
    });

    return el('div', { class: 'auth' }, [
      brandHeader,
      el('h1', {}, 'Recuperar acesso.'),
      el('p', { class: 'muted' }, 'Enviaremos um link para você redefinir sua senha.'),
      panel([
        form,
        el('div', { class: 'subtle-divider' }),
        btn('Voltar para o login', () => c.navigate('login'), 'ghost')
      ])
    ]);
  }

  if (route === 'update-password') {
    // -------------------------------------------------------------
    // DEFINIR NOVA SENHA (após link de recuperação)
    // -------------------------------------------------------------
    const passInput = field('Nova senha (mínimo 6 caracteres)', 'password', 'password', '');
    const pass2Input = field('Confirmar nova senha', 'passwordConfirm', 'password', '');
    const submitBtn = el('button', { class: 'btn primary', type: 'submit' }, 'Salvar nova senha');
    const form = el('form', {}, [passInput, pass2Input, submitBtn]);

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const password = fd.get('password');
      const passwordConfirm = fd.get('passwordConfirm');

      if (!password || password.length < 6) {
        c.notify('A nova senha deve ter no mínimo 6 caracteres.', 'error');
        return;
      }
      if (password !== passwordConfirm) {
        c.notify('As senhas não coincidem.', 'error');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Atualizando senha...';

      try {
        await client.updateUser({ password });
        c.notify('Senha atualizada com sucesso! Bem-vindo de volta.');
        c.navigate('overview');
      } catch (err) {
        c.notify(err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Salvar nova senha';
      }
    });

    return el('div', { class: 'auth' }, [
      brandHeader,
      el('h1', {}, 'Definir nova senha.'),
      el('p', { class: 'muted' }, 'Crie uma nova senha segura para o seu espaço financeiro.'),
      panel([
        form,
        el('div', { class: 'subtle-divider' }),
        btn('Voltar para o login', () => c.navigate('login'), 'ghost')
      ])
    ]);
  }

  // -------------------------------------------------------------
  // TELA DE LOGIN (Padrão)
  // -------------------------------------------------------------
  const emailInput = field('Seu e-mail', 'email', 'email', '');
  const passInput = field('Sua senha', 'password', 'password', '');
  const submitBtn = el('button', { class: 'btn primary', type: 'submit' }, 'Entrar no meu espaço');
  const form = el('form', {}, [emailInput, passInput, submitBtn]);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const email = fd.get('email').trim();
    const password = fd.get('password');

    if (!email || !password) {
      c.notify('Preencha seu e-mail e senha.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Autenticando...';

    try {
      const res = await client.signInWithPassword({ email, password });
      c.notify(`Bem-vindo de volta, ${res.user?.user_metadata?.displayName || 'Você'}!`);
      c.navigate('overview');
    } catch (err) {
      let msg = err.message || '';
      if (msg.includes('Invalid login credentials') || msg.includes('incorretos') || msg.includes('invalid_grant')) {
        msg = 'E-mail ou senha incorretos. Clique no ícone de olho no campo de senha para conferir o que digitou, ou use "Esqueci minha senha" para redefinir.';
      }
      c.notify(msg, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Entrar no meu espaço';
    }
  });

  // Botão secundário discreto para instalação PWA
  let installRow = null;
  if (!isPwaInstalled()) {
    const installBtn = el('button', {
      type: 'button',
      class: 'btn ghost auth-install-btn',
      'aria-label': 'Instalar aplicativo Finance OS',
      title: 'Instalar aplicativo no seu celular ou computador',
      onClick: () => triggerPwaInstall(c)
    }, [
      icon('download'),
      el('span', {}, 'Instalar aplicativo')
    ]);
    installRow = el('div', { class: 'auth-install-row' }, [installBtn]);

    onInstallAvailabilityChange(({ installed }) => {
      if (installed && installRow) installRow.remove();
    });
  }

  return el('div', { class: 'auth' }, [
    brandHeader,
    el('h1', {}, 'Bem-vindo ao seu espaço.'),
    el('p', { class: 'muted' }, 'Menos ruído. Mais clareza sobre o seu dinheiro.'),
    panel([
      form,
      el('div', { class: 'subtle-divider' }),
      el('div', { class: 'actions' }, [
        btn('Criar conta', () => c.navigate('signup'), 'ghost'),
        btn('Esqueci minha senha', () => c.navigate('forgot-password'), 'ghost')
      ]),
      installRow
    ].filter(Boolean))
  ]);
}
