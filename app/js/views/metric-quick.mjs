import {el,icon,btn,iconBtn,money,fmtDate,openDialog,confirmDialog} from '../ui.mjs';
import {parseBrlCents,formatBrlCents} from '../currency.mjs';
import {createVoiceSession} from '../speech.mjs';
import {interpretAssistant} from '../assistant.mjs';
import {today,balance} from '../domain.mjs';
import {accountForm} from './account-form.mjs';
import {goalForm} from './goals.mjs';

const CATEGORIES = [
 'Alimentação', 'Mercado', 'Restaurantes e delivery', 'Padaria', 'Lanches',
 'Transporte', 'Combustível', 'Transporte por aplicativo', 'Moradia', 'Aluguel',
 'Energia', 'Água', 'Internet e telefone', 'Saúde', 'Medicamentos',
 'Pets', 'Pets — Ração', 'Lazer', 'Assinaturas', 'Compras', 'Salário', 'Renda extra', 'Outros'
];

export function openMetricQuickAction(c, type) {
 const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
 let listening = false;
 let currentTranscript = '';
 let dialog = null;

 const isIncome = type === 'income';
 const isExpense = type === 'expense';
 const isBalance = type === 'balance';
 const isGoals = type === 'goals';

 const title = isIncome
  ? 'Receitas do mês • Lançar ou Editar'
  : isExpense
  ? 'Despesas do mês • Lançar ou Editar'
  : isBalance
  ? 'Saldo disponível • Contas e Ajuste'
  : 'Reservado em metas • Aportar ou Editar';

 const container = el('div', {class: 'metric-quick-container'});

 // Voice Session
 const voice = createVoiceSession({
  Recognition,
  onState: state => {
   listening = state !== 'idle';
   updateVoiceUI();
   if (state === 'idle' && currentTranscript) {
    const textToProcess = currentTranscript;
    currentTranscript = '';
    handleVoiceInput(textToProcess);
   }
  },
  onText: (text, isFinal) => {
   currentTranscript = text;
   showLiveTranscript(text);
   if (isFinal) voice.stop();
  },
  onError: message => {
   showFeedback('error', message);
  }
 });

 function handleVoiceInput(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return;
  showFeedback('processing', 'Processando fala…');
  try {
   let input = text;
   if (isIncome && !/recebi|ganhei|entrou|entrada|receita|salario|salário/i.test(input)) {
    input = 'Entrou ' + input;
   } else if (isExpense && !/gastei|paguei|comprei|gasto|despesa|saida|saída/i.test(input)) {
    input = 'Gastei ' + input;
   }

   const response = interpretAssistant(input, c.state, {month: c.month});
   if (response.kind === 'help') {
    showFeedback('error', response.message);
    return;
   }
   if (response.kind === 'draft') {
    const t = response.transaction;
    if (!c.state.accounts.length) {
     showFeedback('error', 'Cadastre uma conta antes de lançar.');
     return;
    }
    const account = c.state.accounts.find(a => a.id === t.accountId) || c.state.accounts[0];
    const payload = {
     id: null,
     description: t.description,
     notes: '',
     type: isIncome ? 'income' : (isExpense ? 'expense' : t.type),
     amountCents: t.amountCents,
     date: t.date || today(),
     accountId: account.id,
     toAccountId: null,
     cardId: null,
     invoiceMonth: null,
     category: t.category || (isIncome ? 'Renda extra' : 'Outros'),
     tags: t.tags || [],
     priority: '',
     memberId: c.state.members.find(m => m.id === 'me')?.id || c.state.members[0]?.id
    };
    c.dispatch('saveTransaction', payload);
    const label = payload.type === 'income' ? 'Entrada' : 'Saída';
    const tagInfo = payload.tags.length ? ' #' + payload.tags.join(' #') : '';
    c.notify(`✓ ${label} de ${money(payload.amountCents, false)} adicionada!${tagInfo}`, 'positive');
    if (dialog) {
     dialog.close();
     dialog.remove();
    }
   }
  } catch (err) {
   showFeedback('error', err.message || 'Erro ao processar fala.');
  }
 }

 const voiceBox = el('div', {class: 'metric-quick-voice-box'});
 function updateVoiceUI() {
  voiceBox.replaceChildren(
   el('button', {
    type: 'button',
    class: `btn primary metric-quick-voice-btn ${listening ? 'is-listening' : ''}`,
    onClick: () => {
     if (listening) {
      voice.stop();
     } else {
      voice.start();
     }
    }
   }, [
    icon('mic'),
    el('span', {}, listening ? 'Ouvindo agora… Toque para parar' : 'Ditar por voz aqui mesmo')
   ]),
   el('div', {class: 'metric-quick-live-box'})
  );
 }

 function showLiveTranscript(text) {
  const box = voiceBox.querySelector('.metric-quick-live-box');
  if (!box) return;
  box.replaceChildren(
   el('div', {class: 'metric-quick-live-text'}, [
    el('span', {class: 'status-dot listening-dot'}),
    el('span', {}, `“${text}”`)
   ])
  );
 }

 function showFeedback(type, message) {
  const box = voiceBox.querySelector('.metric-quick-live-box');
  if (!box) return;
  box.replaceChildren(
   el('div', {class: `metric-quick-feedback ${type}`}, message)
  );
 }

 updateVoiceUI();

 let amountInput = null;

 if (isIncome || isExpense) {
  amountInput = el('input', {
   type: 'text',
   inputmode: 'decimal',
   placeholder: '0,00',
   required: true,
   class: 'metric-quick-amount-input',
   onKeydown: e => {
    if (e.key === 'Enter') {
     e.preventDefault();
     submitQuickEntry();
    }
   }
  });

  const descInput = el('input', {
   type: 'text',
   placeholder: isIncome ? 'Ex.: Salário, Venda, Freela' : 'Ex.: Pão no Thiago, Uber, Mercado',
   required: true,
   class: 'metric-quick-text-input',
   onKeydown: e => {
    if (e.key === 'Enter') {
     e.preventDefault();
     submitQuickEntry();
    }
   }
  });

  const categorySelect = isExpense ? el('select', {class: 'metric-quick-select'},
   CATEGORIES.map(cat => el('option', {value: cat, selected: cat === 'Padaria'}, cat))
  ) : null;

  const accountSelect = c.state.accounts.length > 1 ? el('select', {class: 'metric-quick-select'},
   c.state.accounts.map(acc => el('option', {value: acc.id}, acc.name))
  ) : null;

  function submitQuickEntry() {
   try {
    const rawVal = amountInput.value.trim();
    if (!rawVal) throw Error('Informe o valor.');
    const cents = parseBrlCents(rawVal);
    const description = descInput.value.trim() || (isIncome ? 'Receita' : 'Despesa');
    if (!c.state.accounts.length) throw Error('Cadastre uma conta antes de lançar.');
    const accountId = accountSelect ? accountSelect.value : c.state.accounts[0].id;
    const category = isIncome ? 'Salário' : (categorySelect ? categorySelect.value : 'Outros');

    c.dispatch('saveTransaction', {
     id: null,
     description,
     notes: '',
     type: isIncome ? 'income' : 'expense',
     amountCents: cents,
     date: today(),
     accountId,
     toAccountId: null,
     cardId: null,
     invoiceMonth: null,
     category,
     tags: [],
     priority: '',
     memberId: c.state.members.find(m => m.id === 'me')?.id || c.state.members[0]?.id
    });

    const label = isIncome ? 'Entrada' : 'Saída';
    c.notify(`✓ ${label} de ${money(cents, false)} adicionada com sucesso!`, 'positive');
    if (dialog) {
     dialog.close();
     dialog.remove();
    }
   } catch (err) {
    showFeedback('error', err.message);
   }
  }

  const quickForm = el('div', {class: 'metric-quick-form'}, [
   el('div', {class: 'metric-quick-amount-wrap'}, [
    el('span', {class: 'currency-sym'}, 'R$'),
    amountInput
   ]),
   el('div', {class: 'metric-quick-inputs-row'}, [
    descInput,
    categorySelect,
    accountSelect
   ].filter(Boolean)),
   el('button', {
    type: 'button',
    class: 'btn primary metric-quick-save-btn',
    onClick: e => {
     e.preventDefault();
     submitQuickEntry();
    }
   }, [
    icon(isIncome ? 'up' : 'plus'),
    el('span', {}, isIncome ? '+ Salvar Entrada' : '− Salvar Saída')
   ])
  ]);

  const relevantTransactions = c.state.transactions
   .filter(t => t.date.startsWith(c.month) && (isIncome ? t.type === 'income' : ['expense', 'cardPurchase'].includes(t.type)))
   .sort((a, b) => b.date.localeCompare(a.date))
   .slice(0, 5);

  const listHead = el('h4', {class: 'metric-quick-list-title'}, [
   icon(isIncome ? 'up' : 'arrowDown'),
   el('span', {}, `Lançamentos deste mês (${relevantTransactions.length})`)
  ]);

  const listItems = relevantTransactions.length
   ? el('div', {class: 'metric-quick-item-list'}, relevantTransactions.map(t => {
      return el('div', {class: 'metric-quick-item-row'}, [
       el('div', {class: 'grow'}, [
        el('strong', {}, t.description),
        el('div', {class: 'small muted'}, `${fmtDate(t.date)} • ${t.category}${t.tags?.length ? ' #' + t.tags.join(' #') : ''}`)
       ]),
       el('div', {class: `number ${isIncome ? 'positive' : ''}`}, money(t.amountCents, c.state.preferences.hideAmounts)),
       el('div', {class: 'metric-item-actions'}, [
        iconBtn('edit', 'Editar ' + t.description, () => {
         if (dialog) {
          dialog.close();
          dialog.remove();
         }
         c.openTransaction(t);
        }),
        iconBtn('close', 'Excluir ' + t.description, () => {
         confirmDialog('Excluir transação?', 'Deseja remover este lançamento?', () => {
          c.dispatch('deleteTransaction', t.id);
          c.notify('Transação excluída.', 'positive');
          if (dialog) {
           dialog.close();
           dialog.remove();
          }
         });
        })
       ])
      ]);
     }))
   : el('p', {class: 'small muted'}, 'Nenhum lançamento registrado neste mês.');

  container.append(
   voiceBox,
   quickForm,
   listHead,
   listItems
  );

 } else if (isBalance) {
  const accountsList = el('div', {class: 'metric-quick-accounts-list'},
   c.state.accounts.map(acc => {
    const accBalance = balance(c.state, acc.id);
    return el('div', {class: 'metric-quick-account-row'}, [
     el('div', {class: 'account-logo', style: '--bank:' + acc.color}, acc.name.slice(0, 2).toLowerCase()),
     el('div', {class: 'grow'}, [
      el('h4', {}, acc.name),
      el('div', {class: 'number'}, money(accBalance, c.state.preferences.hideAmounts))
     ]),
     btn('Ajustar conta', () => {
      if (dialog) {
       dialog.close();
       dialog.remove();
      }
      accountForm(c, acc);
     }, 'ghost', 'edit')
    ]);
   })
  );

  container.append(
   voiceBox,
   el('p', {class: 'small muted', style: 'margin: 8px 0;'}, 'Dite um lançamento acima ou ajuste o saldo de uma das suas contas:'),
   accountsList,
   btn('+ Cadastrar nova conta', () => {
    if (dialog) {
     dialog.close();
     dialog.remove();
    }
    accountForm(c);
   }, 'primary', 'plus')
  );

 } else if (isGoals) {
  const goalsList = c.state.goals.length
   ? el('div', {class: 'metric-quick-goals-list'}, c.state.goals.map(g => {
      return el('div', {class: 'metric-quick-goal-row'}, [
       el('div', {class: 'grow'}, [
        el('strong', {}, g.name),
        el('div', {class: 'small muted'}, `Meta: ${money(g.targetCents, c.state.preferences.hideAmounts)}`)
       ]),
       btn('Aportar', () => {
        if (dialog) {
         dialog.close();
         dialog.remove();
        }
        c.navigate('goals');
       }, 'primary', 'target')
      ]);
     }))
   : el('p', {class: 'small muted'}, 'Nenhuma meta criada ainda. Defina um objetivo para acompanhar suas economias.');

  container.append(
   voiceBox,
   goalsList,
   btn('+ Nova meta', () => {
    if (dialog) {
     dialog.close();
     dialog.remove();
    }
    goalForm(c);
   }, 'primary', 'plus')
  );
 }

 dialog = openDialog({
  title,
  content: container,
  submitLabel: 'Fechar',
  onSubmit: () => {
   voice.stop();
  }
 });

 dialog.classList.add('metric-quick-dialog');

 dialog.addEventListener('close', () => {
  voice.dispose();
 });

 if (amountInput) {
  setTimeout(() => {
   try {
    amountInput.focus();
   } catch {}
  }, 100);
 }

 return dialog;
}
