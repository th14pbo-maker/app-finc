import {interpretAssistant} from '../assistant.mjs';
import {createVoiceSession} from '../speech.mjs';
import {el,btn,icon,iconBtn,money,monthLabel,restoreFocus} from '../ui.mjs';

export function openAssistant(c){
 if(document.querySelector('.assistant-dialog'))return;
 if(!document.querySelector('link[data-assistant-style]'))document.head.append(el('link',{rel:'stylesheet',href:new URL('../../styles/assistant.css',import.meta.url).href,'data-assistant-style':true}));
 const last=document.activeElement,Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 let closed=false,listening=false,lastError='';
 const dialog=el('dialog',{class:'dialog assistant-dialog','aria-labelledby':'assistant-title'});
 const status=el('p',{class:'assistant-status',role:'status','aria-live':'polite'},Recognition?'Pronto para ouvir ou receber seu texto.':'A voz não está disponível neste navegador. Use o campo de texto.');
 const result=el('div',{class:'assistant-result','aria-live':'polite'});
 const input=el('textarea',{id:'assistant-input',rows:3,maxlength:500,placeholder:'Ex.: Gastei 35 reais com ração hoje',required:true,'aria-describedby':'assistant-input-help',onInput:()=>result.replaceChildren()});
 const mic=btn('Falar',()=>{if(listening)voice.stop();else{lastError='';voice.start();}},'assistant-mic','mic');
 mic.disabled=!Recognition;mic.setAttribute('aria-pressed','false');
 const interpret=el('button',{type:'submit',class:'btn primary'},[icon('sparkles'),'Interpretar']);
 const voice=createVoiceSession({Recognition,
  onState:state=>{
   listening=state!=='idle';input.readOnly=listening;interpret.disabled=listening;
   dialog.querySelectorAll('.assistant-examples button').forEach(button=>{button.disabled=listening;});
   mic.setAttribute('aria-pressed',String(listening));mic.classList.toggle('is-listening',listening);
   mic.replaceChildren(icon('mic'),listening?'Parar':'Falar');
   status.textContent=lastError||(state==='starting'?'Aguardando o microfone…':state==='listening'?'Ouvindo… fale uma frase.':state==='stopping'?'Concluindo a transcrição…':'Confira o texto e toque em Interpretar.');
  },
  onText:text=>{input.value=text.slice(0,500);result.replaceChildren();},
  onError:message=>{lastError=message;status.textContent=message;}
 });
 const cleanup=()=>{if(closed)return;closed=true;voice.dispose();document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('pagehide',close);window.removeEventListener('hashchange',close);dialog.remove();restoreFocus(last);};
 const close=()=>{if(dialog.open)dialog.close();cleanup();};
 const onVisibility=()=>{if(document.hidden)close();};
 document.addEventListener('visibilitychange',onVisibility);window.addEventListener('pagehide',close);window.addEventListener('hashchange',close);
 dialog.addEventListener('close',cleanup);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 const examples=['Gastei 35 reais com ração hoje','Qual meu saldo?','Quanto gastei com alimentação este mês?','Qual minha projeção?'];
 const form=el('form',{class:'assistant-form',onSubmit:event=>{
  event.preventDefault();if(listening)return;
  const response=interpretAssistant(input.value,c.state,{month:c.month});
  result.replaceChildren();
  if(response.kind==='help'){result.append(el('p',{class:'assistant-help'},response.message));return;}
  if(response.kind==='answer'){
   result.append(el('div',{class:'assistant-answer'},[
    el('small',{},response.title),el('strong',{class:'number '+(response.valueCents<0?'negative':'')},money(response.valueCents,c.state.preferences.hideAmounts)),
    response.month&&el('small',{class:'muted'},monthLabel(response.month)),el('p',{class:'small secondary'},response.detail)
   ]));return;
  }
  const t=response.transaction,account=c.state.accounts.find(a=>a.id===t.accountId);
  const row=(label,value)=>el('div',{},[el('dt',{},label),el('dd',{},value)]);
  result.append(el('div',{class:'assistant-draft'},[
   el('span',{class:'assistant-draft-label'},[icon('edit'),'Rascunho · ainda não salvo']),
   el('h3',{},t.description),el('strong',{class:'number '+(t.type==='income'?'positive':'negative')},[(t.type==='income'?'+ ':'− '),money(t.amountCents,c.state.preferences.hideAmounts)]),
   el('dl',{},[row('Tipo',t.type==='income'?'Receita':'Despesa'),row('Data',t.date.split('-').reverse().join('/')),row('Categoria',t.category),row('Conta',account?.name||'Escolha ao revisar')]),
   el('p',{class:'small secondary'},response.message),
   btn(c.state.accounts.length?'Revisar lançamento':'Cadastrar uma conta',()=>{close();if(c.state.accounts.length)c.openTransaction(t);else{c.navigate('accounts');c.notify('Cadastre uma conta e volte ao Assistente para preparar o lançamento.');}},'primary',c.state.accounts.length?'edit':'plus')
  ]));
 }},[
  el('div',{class:'dialog-head'},[el('div',{},[el('span',{class:'assistant-eyebrow'},[icon('mic'),'VOZ E TEXTO']),el('h2',{id:'assistant-title'},'Seu dinheiro, em palavras.')]),iconBtn('close','Fechar assistente',close)]),
  el('p',{class:'secondary assistant-intro'},'Prepare um lançamento ou faça uma consulta rápida aos seus registros.'),
  el('label',{for:'assistant-input'},'O que você quer registrar ou consultar?'),input,
  el('small',{id:'assistant-input-help',class:'muted'},'Uma frase por vez. Você revisa antes de salvar.'),
  el('div',{class:'assistant-controls'},[mic,interpret]),status,
  el('div',{class:'assistant-examples','aria-label':'Exemplos de frases'},examples.map(text=>btn(text,()=>{if(listening)voice.stop();input.value=text;result.replaceChildren();input.focus();},'ghost'))),
  result,
  el('details',{class:'assistant-details'},[
   el('summary',{},'Como funciona e privacidade'),
   el('p',{},'Este assistente usa comandos simples, não um chat de IA geral. As consultas são calculadas com os registros deste navegador. Sem período informado, usamos o mês selecionado: '+monthLabel(c.month)+'.'),
   el('p',{},'Ao tocar em Falar, o navegador pode enviar o áudio ao seu serviço de reconhecimento e exigir internet. O Finance OS não grava áudio nem salva esta conversa. O microfone para ao concluir, após até 20 segundos de escuta ou ao fechar esta janela.'),
   el('p',{},'Você pode dizer “Recebi mil reais de salário”, “Gastei 20 com lanche ontem na conta Principal” ou “Se eu gastar 200 reais, como fica meu futuro?”. Valores, categorias e datas continuam editáveis no formulário. Para cartão, faturas, parcelas e transferências, use Nova transação.')
  ])
 ]);
 dialog.append(form);document.body.append(dialog);dialog.showModal();input.focus();return dialog;
}
