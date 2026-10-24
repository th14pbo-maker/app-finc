import {workspaceMenu} from './workspace-menu.mjs';
import {initialState} from './initial-state.mjs';
import {createStore} from './store.mjs';
import {uid,monthNow,validateTransaction,invoice,invoiceMonth} from './domain.mjs';
import {el,icon,btn,iconBtn,toast,monthLabel,empty,userAvatar} from './ui.mjs';
import {renderOverview,renderAccounts} from './views/overview.mjs';
import {renderTransactions,transactionForm} from './views/transactions.mjs';
import {renderCards} from './views/cards.mjs';
import {renderGoals} from './views/goals.mjs';
import {renderSettings,renderDemoEntry} from './views/settings.mjs';
let storage;try{storage=window.localStorage}catch{storage={getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('blocked')}}}
const store=createStore(storage,initialState());let month=monthNow();
const nav=[['overview','Visão geral','dashboard'],['accounts','Contas','wallet'],['cards','Cartões','card'],['transactions','Transações','arrows'],['goals','Metas','target'],['settings','Configurações','settings']];
const views={overview:renderOverview,accounts:renderAccounts,cards:renderCards,transactions:renderTransactions,goals:renderGoals,settings:renderSettings,login:renderDemoEntry,signup:renderDemoEntry};
const route=()=>{const r=location.hash.slice(1);return r==='family'?'overview':r==='planning'?'goals':r||'overview'};
function persist(state){const result=store.save(state);if(!result.ok)throw Error(result.error);render();toast('Alteração salva neste navegador.');return true}
function dispatch(action,payload){const s=store.getState();const upsert=(list,value)=>{const id=value.id||uid();const index=list.findIndex(i=>i.id===id);if(index>=0)list[index]={...value,id};else list.push({...value,id})};
if(action==='saveTransaction'){const errors=validateTransaction(s,payload);if(errors.length)throw Error(errors.join('\n'));upsert(s.transactions,payload)}
else if(action==='deleteTransaction')s.transactions=s.transactions.filter(t=>t.id!==payload);
else if(action==='saveAccount')upsert(s.accounts,payload);
else if(action==='deleteAccount')s.accounts=s.accounts.filter(a=>a.id!==payload);
else if(action==='saveCard')upsert(s.cards,payload);
else if(action==='deleteCard')s.cards=s.cards.filter(a=>a.id!==payload);
else if(action==='saveGoal')upsert(s.goals,payload);
else if(action==='deleteGoal'){s.goals=s.goals.filter(g=>g.id!==payload);s.contributions=s.contributions.filter(g=>g.goalId!==payload)}
else if(action==='contribute')upsert(s.contributions,payload);
else if(action==='preferences')s.preferences={...s.preferences,...payload};
else if(action==='importState'){const r=store.reset(payload);if(!r.ok)throw Error(r.error);render();toast('Backup restaurado neste navegador.');return true}
else if(action==='reset'){const r=store.reset(initialState());if(!r.ok)throw Error(r.error);render();toast('Seu espaço financeiro foi zerado.');return true}
else throw Error('Ação desconhecida.');
for(const card of s.cards){const months=new Set(s.transactions.filter(t=>t.cardId===card.id).map(t=>t.type==='cardPayment'?t.invoiceMonth:invoiceMonth(card,t.date)));for(const m of months)if(invoice(s,card.id,m).dueCents<0)throw Error('Esta alteração deixaria uma fatura paga além do total. Ajuste o pagamento primeiro.');}
return persist(s)}
function navigate(r){location.hash=r}
function render(){const state=store.getState(),r=route();const theme=state.preferences.theme==='light'?'light':'dark';document.documentElement.dataset.theme=theme;document.querySelector('meta[name="theme-color"]').content=theme==='light'?'#f6f8fa':'#000000';const c={state,month,dispatch,navigate,notify:toast,route:r,openTransaction:(t=null,accountId=null)=>transactionForm(c,t,accountId),period:()=>el('label',{class:'period'},[el('span',{class:'hide'},'Mês de referência'),el('input',{type:'month',value:month,'aria-label':'Mês de referência',onChange:e=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)){month=e.target.value;render()}}})] )};
const brand=cls=>el('a',{href:'#overview',class:'brand '+(cls||''),'aria-label':'Finance OS, início'},[el('div',{class:'brand-mark'},'f'),el('div',{},['finance',el('span',{},'os')])]);
const navLink=([id,label,ico])=>el('a',{href:'#'+id,class:r===id?'active':'','aria-label':label,'aria-current':r===id?'page':null},[icon(ico),el('span',{},label)]);
const sidebar=el('aside',{class:'sidebar'},[brand(),workspaceMenu(c),el('p',{class:'nav-label'},'PRINCIPAL'),el('nav',{class:'nav','aria-label':'Navegação principal'},nav.filter(([id])=>id!=='settings').map(navLink)),el('div',{class:'nav-separator'}),el('p',{class:'nav-label'},'SEU ESPAÇO'),el('nav',{class:'nav','aria-label':'Seu espaço'},nav.filter(([id])=>id==='settings').map(navLink)),el('div',{class:'sidebar-bottom'},[el('div',{class:'demo-note'},[el('div',{class:'accent'},[icon('shield')]),el('strong',{},'Seu futuro começa aqui.'),el('p',{},'Organize o presente. Abra espaço para os seus próximos planos.')]),el('a',{class:'profile-link',href:'#settings'},[userAvatar(state.preferences),el('div',{class:'grow'},[el('div',{class:'small'},state.preferences.displayName),el('small',{},'Espaço pessoal')]),icon('chevron')])])]);
const title=nav.find(n=>n[0]===r)?.[1]||'Bem-vindo';const top=el('header',{class:'topbar'},[el('div',{class:'breadcrumb'},[icon('home'),el('span',{},'/'),el('strong',{},title)]),brand('mobile-brand'),el('div',{class:'top-actions'},[el('span',{class:'demo-badge'},'MODO LOCAL'),el('button',{type:'button',class:'btn ghost assistant-trigger','aria-label':'Abrir assistente por voz ou texto',title:'Assistente por voz ou texto',onClick:async e=>{const button=e.currentTarget;button.disabled=true;try{const {openAssistant}=await import('./views/assistant.mjs');openAssistant({...c,state:store.getState(),month})}catch{toast('Não foi possível abrir o assistente. Confira a conexão e tente novamente.','error')}finally{button.disabled=false}}},[icon('mic'),el('span',{},'Assistente')]),iconBtn(theme==='dark'?'sun':'moon',theme==='dark'?'Ativar modo claro':'Ativar modo escuro',()=>{try{dispatch('preferences',{theme:theme==='dark'?'light':'dark'})}catch(e){toast(e.message,'error')}}),iconBtn('eye',state.preferences.hideAmounts?'Mostrar valores':'Ocultar valores',()=>{try{dispatch('preferences',{hideAmounts:!state.preferences.hideAmounts})}catch(e){toast(e.message,'error')}}),el('a',{href:'#settings',class:'top-profile','aria-label':'Editar perfil'},userAvatar(state.preferences))])]);
let content;try{content=(views[r]||(()=>empty('Página não encontrada','Use a navegação para continuar.')))(c)}catch(e){content=empty('Não foi possível exibir esta área',e.message)}
const main=el('main',{class:'main',id:'main',tabindex:'-1'},[store.error&&el('div',{class:'notice warning',role:'alert'},store.error),content,el('footer',{class:'bottom-note'},[el('span',{},[el('i',{class:'status-dot'}),'Dados salvos apenas neste navegador']),el('span',{},'Feito para os seus próximos passos.')])]);
const mobileLabels={overview:'Início',accounts:'Contas',cards:'Cartões',transactions:'Extrato',goals:'Metas',settings:'Ajustes'};
const mobile=el('nav',{class:'mobile-nav','aria-label':'Navegação mobile'},nav.map(([id,label,ico])=>navLink([id,mobileLabels[id]||label,ico])));document.getElementById('app').replaceChildren(sidebar,el('div',{class:'shell'},[top,main]),mobile);document.title=title+' · Finance OS'}
document.addEventListener('click',e=>{const menu=document.querySelector('.workspace-menu[open]');if(menu&&!menu.contains(e.target))menu.open=false});
document.querySelector('.skip').addEventListener('click',e=>{e.preventDefault();document.getElementById('main').focus()});
window.addEventListener('hashchange',()=>{render();window.scrollTo(0,0);document.getElementById('main').focus({preventScroll:true})});render();
