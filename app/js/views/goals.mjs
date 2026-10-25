import {parseBrlCents} from '../currency.mjs';
import {goalInsights} from '../goal-analytics.mjs';
import {goalSummary,goalInsightsPanel,goalStatus,goalRing} from './goal-insights.mjs';
import {goalProgress,today,shiftMonth,monthNow,dateAt} from '../domain.mjs';
import {el,icon,btn,iconBtn,header,panel,panelHead,field,openDialog,confirmDialog,money,progress,empty,fmtDate} from '../ui.mjs';
import {openGoalQuickAction} from './metric-quick.mjs';

export function goalForm(c,g=null,kind='general'){
  const content=el('div',{class:'form-grid'},[
    field('Nome do objetivo','name','text',g?.name||''),
    field('Tipo de objetivo','kind','text',g?.kind||kind,[['general','Meta pessoal'],['car','Carro'],['home','Apartamento']]),
    field('Valor a reservar (R$)','target','money',g?g.targetCents/100:''),
    field('Já reservado inicialmente (R$)','initial','money',(g?.initialCents||0)/100,null,{minCents:0}),
    field('Data para alcançar','targetDate','date',g?.targetDate||dateAt(shiftMonth(monthNow(),12),1)),
    el('p',{class:'small muted wide'},'Para carro e apartamento, use o valor total à vista ou apenas a entrada que deseja reservar. Os aportes não movimentam suas contas automaticamente.')
  ]);
  openDialog({
    title:g?'Editar objetivo':'Seu próximo objetivo',
    content,
    onSubmit:d=>{
      const targetCents=parseBrlCents(d.target),initialCents=parseBrlCents(d.initial,{minCents:0});
      if(!d.name.trim()||!Number.isSafeInteger(targetCents)||targetCents<=0||targetCents>1e12||!Number.isSafeInteger(initialCents)||initialCents<0||initialCents>1e12)throw Error('Confira o nome e os valores do objetivo.');
      c.dispatch('saveGoal',{id:g?.id,name:d.name.trim().slice(0,80),kind:d.kind,targetCents,initialCents,targetDate:d.targetDate});
    }
  });
}

function contribute(c,g,entry=null){
  const amount=field('Valor reservado (R$)','amount','money',entry?entry.amountCents/100:'');
  const dialogWrap=el('div',{},[
    amount,
    field('Data do aporte','date','date',entry?.date||today()),
    el('p',{class:'small muted'},'Este registro acompanha sua reserva. Ele não debita contas nem cria uma nova despesa. Datas futuras são tratadas como aportes agendados.')
  ]);
  if(entry?.id){
    dialogWrap.append(
      btn('Excluir este aporte',()=>confirmDialog('Excluir aporte?','O valor será deduzido da meta.',()=>{
        c.dispatch('deleteContribution',entry.id);
        dialog.close();
        dialog.remove();
      }),'danger wide')
    );
  }
  const dialog=openDialog({
    title:(entry?'Editar aporte em ':'Aportar em ')+g.name,
    content:dialogWrap,
    submitLabel:entry?'Salvar alterações':'Registrar aporte',
    onSubmit:d=>{
      const amountCents=parseBrlCents(d.amount);
      if(!Number.isSafeInteger(amountCents)||amountCents<=0||amountCents>1e12)throw Error('Informe um valor positivo válido.');
      c.dispatch('contribute',{id:entry?.id,goalId:g.id,date:d.date,amountCents});
    }
  });
}

function contributionHistory(c,g){
  const rows=c.state.contributions.filter(x=>x.goalId===g.id).sort((a,b)=>b.date.localeCompare(a.date));
  const historyDialog=openDialog({
    title:'Aportes · '+g.name,
    submitLabel:'Fechar',
    content:el('div',{},[
      el('div',{class:'kv'},[
        el('span',{},'Reserva inicial informada'),
        el('strong',{},money(g.initialCents,c.state.preferences.hideAmounts))
      ]),
      rows.length?el('div',{class:'goal-history'},rows.map(x=>el('div',{class:'kv'},[
        el('span',{},[fmtDate(x.date)+' de '+x.date.slice(0,4),x.date>today()&&el('small',{class:'accent'},' · Agendado')]),
        el('strong',{class:'number positive'},money(x.amountCents,c.state.preferences.hideAmounts)),
        el('div',{class:'metric-item-actions'},[
          iconBtn('edit','Editar aporte de '+fmtDate(x.date),()=>{historyDialog.close();historyDialog.remove();contribute(c,g,x)}),
          iconBtn('close','Remover aporte de '+fmtDate(x.date),()=>confirmDialog('Excluir aporte?','Deseja remover este aporte?',()=>{
            c.dispatch('deleteContribution',x.id);
            historyDialog.close();
            historyDialog.remove();
            contributionHistory(c,g);
          }))
        ])
      ]))):empty('Ainda sem aportes','A reserva inicial é independente do histórico de aportes.')
    ]),
    onSubmit:()=>{}
  });
}

function goalCard(c,g){
  const p=goalInsights(c.state,g.id),hidden=c.state.preferences.hideAmounts;

  // Inline Quick Input
  const inlineInput = el('input', {
    type: 'text',
    inputmode: 'decimal',
    placeholder: '+ R$ 0,00',
    class: 'goal-inline-input',
    'aria-label': 'Valor para adicionar à meta ' + g.name,
    onKeydown: e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitInlineAporte();
      }
    }
  });

  const submitInlineAporte = () => {
    const val = inlineInput.value.trim();
    if (!val) return;
    try {
      const cents = parseBrlCents(val);
      c.dispatch('contribute', {
        id: null,
        goalId: g.id,
        date: today(),
        amountCents: cents
      });
      c.notify(`✓ ${money(cents, false)} adicionados a "${g.name}"!`, 'positive');
      inlineInput.value = '';
    } catch (err) {
      c.notify(err.message, 'error');
    }
  };

  const inlineBar = el('div', {class: 'goal-inline-bar'}, [
    el('button', {
      type: 'button',
      class: 'btn ghost goal-inline-mic',
      title: 'Ditar valor por voz para ' + g.name,
      'aria-label': 'Ditar valor por voz para ' + g.name,
      onClick: () => openGoalQuickAction(c, g, true)
    }, [icon('mic'), el('span', {}, 'Ditar')]),
    el('div', {class: 'goal-inline-input-wrap'}, [
      inlineInput
    ]),
    el('button', {
      type: 'button',
      class: 'btn primary goal-inline-save',
      title: 'Adicionar valor ganho ou reservado',
      onClick: submitInlineAporte
    }, [icon('plus'), el('span', {}, 'Guardar')])
  ]);

  return panel([
    el('div',{class:'goal-card-heading'},[
      el('div',{class:'grow'},[
        el('div',{class:'goal-symbol'},icon(g.kind==='car'?'car':g.kind==='home'?'home':'shield')),
        el('h2',{},g.name),
        el('p',{class:'small muted'},'Objetivo para '+fmtDate(g.targetDate)+' de '+g.targetDate.slice(0,4))
      ]),
      goalRing(p.percent)
    ]),
    goalStatus(p),
    el('div',{class:'goal-value-row'},[
      el('div',{
        class:'goal-value number goal-value-clickable',
        role:'button',
        tabIndex:0,
        'aria-label':'Adicionar aporte ou ditar para '+g.name,
        title:'Clique para ditar ou adicionar valor reservado',
        onClick:()=>openGoalQuickAction(c,g),
        onKeydown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openGoalQuickAction(c,g);}}
      },[
        el('span',{},money(p.savedCents,hidden)),
        el('button',{
          type:'button',
          class:'metric-hint-btn goal-hint-btn',
          'aria-label':'Ditar aporte por voz',
          onClick:e=>{
            e.stopPropagation();
            openGoalQuickAction(c,g,true);
          }
        },[icon('mic'),el('span',{},'Ditar')])
      ])
    ]),
    el('p',{class:'small muted goal-target-line'},[
      'reservados de ',
      el('button',{
        type:'button',
        class:'goal-target-link-btn',
        'aria-label':'Editar valor do objetivo '+g.name,
        title:'Clique para alterar o objetivo total ('+money(g.targetCents,hidden)+')',
        onClick:()=>goalForm(c,g)
      },[
        el('strong',{},money(g.targetCents,hidden)),
        icon('edit')
      ])
    ]),
    progress(p.percent),
    el('div',{class:'goal-number-grid'},[
      el('div',{},[
        el('span',{class:'small muted'},'Falta reservar'),
        el('strong',{class:'number'},money(p.remainingCents,hidden))
      ]),
      el('div',{},[
        el('span',{class:'small muted'},'Aporte sugerido / mês'),
        el('strong',{class:'number'},p.remainingCents===0?money(0,hidden):p.daysLeft<=0?'Revisar prazo':money(p.monthlyCents,hidden))
      ])
    ]),
    el('div',{class:'kv'},[
      el('span',{},'Registrado neste mês'),
      el('strong',{class:'number'},money(p.monthCents,hidden))
    ]),
    p.scheduledCents>0&&el('div',{class:'kv'},[
      el('span',{},'Agendado para depois'),
      el('strong',{},money(p.scheduledCents,hidden))
    ]),
    inlineBar,
    el('div',{class:'goal-card-actions'},[
      btn('Registrar aporte',()=>openGoalQuickAction(c,g),'primary','plus'),
      iconBtn('edit','Editar objetivo '+g.name,()=>goalForm(c,g)),
      btn('Ver aportes',()=>contributionHistory(c,g),'ghost')
    ]),
    el('div',{class:'goal-card-foot'},[
      el('small',{class:'muted'},'Planejamento sem juros ou rendimentos.'),
      btn('Excluir',()=>confirmDialog('Excluir objetivo?','O objetivo e seus registros de aporte serão removidos.',()=>c.dispatch('deleteGoal',g.id)),'text-btn')
    ])
  ],'goal-detail-card');
}

function renderGoalArea(c,planning){
  const goals=planning?c.state.goals.filter(g=>g.kind!=='general'):c.state.goals;
  const create=()=>goalForm(c,null,planning?'car':'general');
  return el('div',{},[
    header(
      planning?'O futuro cabe no seu plano.':'Sonhos com um plano.',
      planning?'Acompanhe suas reservas para o carro e o apartamento.':'Veja sua evolução, acompanhe os prazos e celebre cada conquista.',
      planning?[btn('Planejar carro',()=>goalForm(c,null,'car'),'','car'),btn('Planejar apartamento',()=>goalForm(c,null,'home'),'primary','home')]:[btn('Nova meta',create,'primary','plus')]
    ),
    goalSummary(c,goals),
    goalInsightsPanel(c,goals,{onCreate:create,onEdit:g=>goalForm(c,g),onContribute:g=>openGoalQuickAction(c,g)}),
    goals.length>0&&el('div',{class:'goal-section-heading'},[
      el('h2',{},planning?'Seus grandes planos':'Seus objetivos'),
      el('span',{class:'small muted'},goals.length+' cadastrados')
    ]),
    goals.length>0&&el('div',{class:'grid-2 goal-card-grid'},goals.map(g=>goalCard(c,g))),
    el('div',{class:'notice goal-method'},[
      icon('sparkles'),
      el('p',{},'O aporte sugerido divide o valor restante pelos meses até o objetivo, com no mínimo um mês. Prazos encerrados precisam ser revistos. Não inclui juros, rendimento, financiamento ou custos da compra. As reservas informadas podem fazer parte dos saldos das suas contas.')
    ])
  ]);
}

export const renderGoals=c=>renderGoalArea(c,false);
