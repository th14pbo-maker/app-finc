import {openMetricQuickAction} from './metric-quick.mjs';
import {projectionPanel} from './projection.mjs';
import {goalForm} from './goals.mjs';
import {flowPanel} from './flow-chart.mjs';
import {balance,summary,goalProgress,openInvoices,today,canDelete} from '../domain.mjs';
import {el,icon,btn,iconBtn,money,panel,panelHead,header,metric,link,progress,transactionTable,confirmDialog,empty,fmtDate} from '../ui.mjs';
import {accountForm} from './account-form.mjs';
export {accountForm};

function accountsPanel(c){
 return panel([
  panelHead('Suas contas',null,link('Ver todas','accounts')),
  ...c.state.accounts.slice(0,3).map(a=>el('div',{class:'account-row'},[
   el('div',{class:'account-logo',style:'--bank:'+a.color},a.name.slice(0,2).toLowerCase()),
   el('div',{class:'grow'},[
    el('h3',{},a.name),
    el('small',{},'Conta manual')
   ]),
   el('div',{class:'number right'},money(balance(c.state,a.id),c.state.preferences.hideAmounts)),
   iconBtn('edit','Editar conta '+a.name,()=>accountForm(c,a))
  ])),
  !c.state.accounts.length&&el('div',{class:'account-empty-prompt'},[
   el('p',{class:'small muted'},'Nenhuma conta cadastrada ainda.'),
   btn('Adicionar conta',()=>accountForm(c),'primary','plus')
  ])
 ],'accounts-panel');
}

export function goalMini(c,g){
 const v=goalProgress(c.state,g.id);
 return el('div',{class:'goal-mini'},[
  el('div',{class:'goal-top'},[
   icon(g.kind==='car'?'car':g.kind==='home'?'home':'shield'),
   el('strong',{},g.name),
   el('small',{},v.percent+'%'),
   iconBtn('edit','Editar meta '+g.name,()=>goalForm(c,g))
  ]),
  progress(v.percent),
  el('div',{class:'goal-caption number'},[
   el('span',{},money(v.savedCents,c.state.preferences.hideAmounts)),
   el('span',{},'de '+money(g.targetCents,c.state.preferences.hideAmounts))
  ])
 ]);
}

function invoicesPanel(c){
 const invoices=openInvoices(c.state);
 const hidden=c.state.preferences.hideAmounts;
 if(!invoices.length){
  return panel([
   el('div',{class:'invoices-ok-row'},[
    el('span',{class:'positive-dot'}),
    el('div',{class:'grow'},[
     el('strong',{},'Faturas em dia'),
     el('small',{class:'muted'},'Nenhuma fatura em aberto')
    ]),
    link('Cartões','cards')
   ])
  ],'compact-card');
 }
 return panel([
  panelHead('Faturas em aberto',null,link('Ver cartões','cards')),
  ...invoices.slice(0,3).map(inv=>el('div',{class:'account-row'},[
   el('span',{class:'category-icon'},icon('card')),
   el('div',{class:'grow'},[
    el('h3',{},c.state.cards.find(card=>card.id===inv.cardId)?.name||'Cartão'),
    el('small',{class:inv.dueDate<today()?'negative':''},(inv.dueDate<today()?'Vencida em ':'Vence em ')+fmtDate(inv.dueDate))
   ]),
   el('span',{class:'number'},money(inv.dueCents,hidden))
  ]))
 ],'invoices-panel');
}

function goalsPanel(c){
 if(!c.state.goals.length){
  return panel([
   el('div',{class:'goal-compact-prompt'},[
    el('div',{},[
     el('strong',{},'Metas financeiras'),
     el('p',{class:'small muted'},'Guarde dinheiro para seus planos')
    ]),
    btn('Nova meta',()=>goalForm(c),'ghost','plus')
   ])
  ],'compact-card');
 }
 return panel([
  panelHead('Metas financeiras',null,link('Ver metas','goals')),
  ...c.state.goals.slice(0,3).map(g=>goalMini(c,g))
 ],'goals-panel');
}

function insightPanel(c,s){
 if(!c.state.accounts.length&&!c.state.transactions.length)return null;
 const isPositive=s.netCents>=0;
 return panel([
  el('div',{class:'insight-head'},[
   icon('sparkles'),
   el('strong',{},isPositive?'Superávit no período':'Atenção ao orçamento')
  ]),
  el('p',{class:'insight-desc'},isPositive
   ?'Suas receitas superam as despesas neste mês. Bom momento para reservar em metas.'
   :'Suas despesas superaram as receitas no período. Acompanhe os lançamentos para equilibrar.'
  )
 ],'insight-card');
}

function evolutionSection(c){
 let activeTab='flow';
 const card=el('div',{class:'panel evolution-panel'});

 const render=()=>{
  const tabs=el('div',{class:'chart-tabs',role:'tablist'},[
   el('button',{
    type:'button',
    class:`chart-tab-btn ${activeTab==='flow'?'active':''}`,
    role:'tab',
    'aria-selected':activeTab==='flow',
    onClick:()=>{activeTab='flow';render();}
   },[icon('arrows'),el('span',{},'Fluxo financeiro')]),
   el('button',{
    type:'button',
    class:`chart-tab-btn ${activeTab==='projection'?'active':''}`,
    role:'tab',
    'aria-selected':activeTab==='projection',
    onClick:()=>{activeTab='projection';render();}
   },[icon('sparkles'),el('span',{},'Projeção futura')])
  ]);

  const content=activeTab==='flow'
   ?flowPanel(c,{embedded:true})
   :projectionPanel(c,{embedded:true});

  card.replaceChildren(
   el('div',{class:'panel-head evolution-head'},[
    el('div',{},[
     el('h2',{},activeTab==='flow'?'Fluxo financeiro':'Projeção futura'),
     el('p',{},activeTab==='flow'?'Receitas e despesas nos últimos seis meses':'Estimativa de saldo com base nos seus lançamentos')
    ]),
    tabs
   ]),
   content
  );
 };

 render();
 return card;
}

export function renderOverview(c){
 const s=summary(c.state,c.month),hidden=c.state.preferences.hideAmounts;
 const total=c.state.accounts.reduce((n,a)=>n+balance(c.state,a.id),0);
 const allGoals=c.state.goals.reduce((n,g)=>n+goalProgress(c.state,g.id).savedCents,0);
 const rows=c.state.transactions.filter(t=>t.date.startsWith(c.month)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
 const importBanner = c.renderImportConsent ? c.renderImportConsent() : null;

 return el('div',{},[
  importBanner,
  header('Visão geral','Seu panorama financeiro em tempo real.',[
   c.period(),
   c.openVoice ? btn('Falar lançamento',()=>c.openVoice(),'secondary hero-voice-btn','mic') : null,
   c.openStatementImport ? btn('Importar extrato',()=>c.openStatementImport(),'secondary hero-statement-btn','upload') : null,
   btn('Nova transação',()=>c.openTransaction(),'primary','plus')
  ].filter(Boolean)),
  !c.state.accounts.length&&el('div',{class:'notice onboarding'},[
   el('div',{},[
    el('h3',{},'Vamos começar pelo seu primeiro saldo?'),
    el('p',{class:'small'},'Adicione uma conta com o saldo atual para dar início ao seu controle financeiro.')
   ]),
   btn('Cadastrar conta',()=>accountForm(c),'primary','plus')
  ]),
  el('div',{class:'metrics'},[
   metric('Saldo disponível',money(total,hidden),[el('span',{class:'status-dot'}),'Somatório atual das contas'],'wallet','featured','',()=>openMetricQuickAction(c,'balance')),
   metric('Receitas do mês',money(s.incomeCents,hidden),[icon('up'),'Entradas no período'],'up','','positive',()=>openMetricQuickAction(c,'income')),
   metric('Despesas do mês',money(s.expenseCents,hidden),[icon('arrowDown'),'Inclui compras no cartão'],'arrowDown','','',()=>openMetricQuickAction(c,'expense')),
   metric('Reservado em metas',money(allGoals,hidden),'Valores informados nas metas','target','','',()=>openMetricQuickAction(c,'goals'))
  ]),
  el('div',{class:'dashboard-grid'},[
   el('div',{class:'stack'},[
    evolutionSection(c),
    panel([
     panelHead('Últimas transações','Os movimentos mais recentes',link('Ver todas','transactions')),
     transactionTable(c,rows)
    ],'transactions-panel')
   ]),
   el('div',{class:'stack'},[
    accountsPanel(c),
    invoicesPanel(c),
    goalsPanel(c),
    insightPanel(c,s)
   ].filter(Boolean))
  ])
 ]);
}

export function renderAccounts(c){
 return el('div',{},[
  header('Suas contas','Cada saldo, no seu lugar.',[btn('Adicionar conta',()=>accountForm(c),'primary','plus')]),
  el('div',{class:'notice'},'Contas manuais • Os saldos refletem todos os lançamentos cadastrados, inclusive datas futuras.'),
  el('div',{class:'grid-3'},c.state.accounts.map(a=>{
   const card=panel([
    el('div',{class:'panel-head'},[
     el('div',{class:'account-logo',style:'--bank:'+a.color},a.name.slice(0,2).toLowerCase()),
     iconBtn('edit','Editar '+a.name,()=>accountForm(c,a))
    ]),
    el('h2',{},a.name),
    el('p',{class:'small muted'},'Saldo disponível'),
    el('div',{class:'balance-line number'},money(balance(c.state,a.id),c.state.preferences.hideAmounts)),
    el('div',{class:'kv'},[el('span',{},'Saldo inicial'),el('strong',{},money(a.initialCents,c.state.preferences.hideAmounts))]),
    el('div',{class:'actions'},[
     btn('Lançar',()=>c.openTransaction(null,a.id),'','plus'),
     btn('Excluir',()=>{
      if(!canDelete(c.state,'account',a.id))return c.notify('Esta conta tem lançamentos. Remova ou mova-os antes de excluir.','error');
      confirmDialog('Excluir conta?','Esta ação remove a conta manual.',()=>c.dispatch('deleteAccount',a.id));
     },'ghost')
    ])
   ],'account-card');
   card.style.setProperty('--bank',a.color);
   return card;
  })),
  !c.state.accounts.length&&panel(empty('Comece pela primeira conta','Adicione seu banco e o saldo inicial.'))
 ]);
}
