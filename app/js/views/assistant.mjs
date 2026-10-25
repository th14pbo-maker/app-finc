import {interpretAssistant} from '../assistant.mjs';
import {createVoiceSession} from '../speech.mjs';
import {el,btn,icon,iconBtn,money,restoreFocus} from '../ui.mjs';

export function openAssistant(c){
 if(document.querySelector('.assistant-dialog'))return;
 if(!document.querySelector('link[data-assistant-style]'))document.head.append(el('link',{rel:'stylesheet',href:new URL('../../styles/assistant.css',import.meta.url).href,'data-assistant-style':true}));
 
 const last=document.activeElement;
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 let closed=false,listening=false,lastError='',autoCloseTimer=null,lastCreatedTxId=null;

 const dialog=el('dialog',{class:'dialog assistant-dialog','aria-labelledby':'assistant-title'});
 const status=el('p',{class:'assistant-status',role:'status','aria-live':'polite'},Recognition?'Toque em Falar ou digite o valor abaixo.':'Reconhecimento de voz indisponível neste navegador. Digite sua movimentação.');
 const result=el('div',{class:'assistant-result','aria-live':'polite'});
 const input=el('textarea',{
  id:'assistant-input',
  rows:2,
  maxlength:500,
  placeholder:'Ex: "entrou 20 reais" ou "gastei 50 no mercado"',
  'aria-describedby':'assistant-input-help',
  onInput:()=>{result.replaceChildren();clearTimeout(autoCloseTimer);}
 });

 const cleanup=()=>{
  if(closed)return;
  closed=true;
  clearTimeout(autoCloseTimer);
  voice.dispose();
  document.removeEventListener('visibilitychange',onVisibility);
  window.removeEventListener('pagehide',close);
  window.removeEventListener('hashchange',close);
  dialog.remove();
  restoreFocus(last);
 };

 const close=()=>{if(dialog.open)dialog.close();cleanup();};
 const onVisibility=()=>{if(document.hidden)close();};
 document.addEventListener('visibilitychange',onVisibility);
 window.addEventListener('pagehide',close);
 window.addEventListener('hashchange',close);
 dialog.addEventListener('close',cleanup);
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});

 function executeAdd(rawText,forceType=null){
  clearTimeout(autoCloseTimer);
  const text=String(rawText||'').trim();
  if(!text){
   status.textContent='Diga ou digite o valor. Exemplo: "entrou 20 reais" ou "gastei 50".';
   return false;
  }
  if(!c.state.accounts.length){
   close();
   c.navigate('accounts');
   c.notify('Cadastre uma conta antes de adicionar lançamentos.','error');
   return false;
  }

  try{
   let response=interpretAssistant(text,c.state,{month:c.month});
   
   // Se o usuário clicou explicitamente em Entrada ou Saída com um valor numérico simples
   if(response.kind!=='draft'&&forceType){
    const cleanNum=text.replace(/^[+-]\s*/,'').trim();
    response=interpretAssistant(`${forceType==='income'?'+':'-'} ${cleanNum}`,c.state,{month:c.month});
   }

   if(response.kind!=='draft'){
    result.replaceChildren(
     el('div',{class:'assistant-help'},[
      el('p',{},'Não identifiquei se foi entrada ou saída. Escolha abaixo:'),
      el('div',{class:'assistant-quick-types'},[
       el('button',{
        type:'button',
        class:'btn ghost btn-quick-income',
        onClick:()=>executeAdd(text,'income')
       },[icon('plus'),'Adicionar como Entrada (+)']),
       el('button',{
        type:'button',
        class:'btn ghost btn-quick-expense',
        onClick:()=>executeAdd(text,'expense')
       },[icon('minus'),'Adicionar como Saída (−)'])
      ])
     ])
    );
    return false;
   }

   const t=response.transaction;
   if(forceType)t.type=forceType;

   const accountId=t.accountId||c.state.accounts[0].id;
   const account=c.state.accounts.find(a=>a.id===accountId)||c.state.accounts[0];

   const payload={
    id:null,
    description:t.description||(t.type==='income'?'Entrada':'Saída'),
    notes:'',
    type:t.type,
    amountCents:t.amountCents,
    date:t.date,
    accountId:account.id,
    toAccountId:null,
    cardId:null,
    invoiceMonth:null,
    category:t.category,
    tags:t.tags||[],
    priority:'',
    memberId:c.state.members.find(m=>m.id==='me')?.id||c.state.members[0]?.id
   };

   c.dispatch('saveTransaction',payload);
   
   // Pega o ID da transação recém criada no state para permitir desfazer
   const freshState=c.state;
   const createdTx=freshState.transactions.find(tx=>tx.amountCents===payload.amountCents&&tx.date===payload.date&&tx.accountId===payload.accountId)||freshState.transactions.at(-1);
   lastCreatedTxId=createdTx?.id||null;

   const isIncome=t.type==='income';
   const typeLabel=isIncome?'Entrada':'Saída (Despesa)';
   const formattedAmount=money(t.amountCents,false);

   c.notify(`${isIncome?'Entrada':'Saída'} de ${formattedAmount} adicionada com sucesso!`,'positive');

   // Exibe confirmação visual de sucesso sem precisar de botão interpretar
   result.replaceChildren(
    el('div',{class:`assistant-success-box ${isIncome?'income':'expense'}`},[
     el('div',{class:'assistant-success-icon'},[icon(isIncome?'plus':'check')]),
     el('h3',{class:'assistant-success-title'},`${typeLabel} adicionada!`),
     el('div',{class:'assistant-success-amount'},[(isIncome?'+ ':'− '),formattedAmount]),
     el('p',{class:'assistant-success-detail'},`Conta: ${account.name} • Categoria: ${t.category} • ${t.date.split('-').reverse().join('/')}`),
     el('div',{class:'assistant-success-actions'},[
      lastCreatedTxId?btn('Desfazer',()=>{
       try{
        c.dispatch('deleteTransaction',lastCreatedTxId);
        c.notify('Lançamento desfeito.');
        result.replaceChildren();
        input.value='';
        input.focus();
       }catch(err){c.notify(err.message,'error');}
      },'ghost danger'):null,
      Recognition?btn('Falar outro',()=>{
       result.replaceChildren();
       input.value='';
       lastError='';
       voice.start();
      },'primary','mic'):null,
      btn('Concluir',close,'ghost')
     ].filter(Boolean))
    ])
   );

   // Fecha suavemente após 3 segundos caso o usuário não clique em Desfazer
   autoCloseTimer=setTimeout(()=>{
    if(dialog.open)close();
   },3200);

   return true;
  }catch(err){
   result.replaceChildren(el('p',{class:'assistant-help'},err.message||'Não foi possível adicionar o lançamento.'));
   return false;
  }
 }

 const mic=btn('Falar',()=>{
  if(listening){
   voice.stop();
  }else{
   lastError='';
   result.replaceChildren();
   clearTimeout(autoCloseTimer);
   voice.start();
  }
 },'assistant-mic','mic');
 mic.disabled=!Recognition;
 mic.setAttribute('aria-pressed','false');

 const voice=createVoiceSession({
  Recognition,
  onState:state=>{
   listening=state!=='idle';
   input.readOnly=listening;
   dialog.querySelectorAll('.assistant-examples button').forEach(b=>{b.disabled=listening;});
   mic.setAttribute('aria-pressed',String(listening));
   mic.classList.toggle('is-listening',listening);
   mic.replaceChildren(icon('mic'),listening?'Parar':'Falar');
   status.textContent=lastError||(state==='starting'?'Aguardando microfone…':state==='listening'?'Ouvindo agora… Diga se entrou ou saiu (ex: "entrou 20 reais").':state==='stopping'?'Adicionando lançamento…':'Toque em Falar ou digite o valor abaixo.');
  },
  onText:(text,isFinal)=>{
   input.value=text.slice(0,500);
   if(isFinal){
    voice.stop();
    executeAdd(text);
   }
  },
  onError:message=>{
   lastError=message;
   status.textContent=message;
  }
 });

 const submitBtn=el('button',{type:'submit',class:'btn primary'},[icon('plus'),'Adicionar Lançamento']);

 const examples=[
  'Entrou 50 reais',
  'Gastei 15 na padaria',
  'Recebi 1.000 de salário',
  'Saiu 40 no mercado',
  'Almoço 35 reais'
 ];

 const form=el('form',{
  class:'assistant-form',
  onSubmit:ev=>{
   ev.preventDefault();
   if(listening){voice.stop();return;}
   executeAdd(input.value);
  }
 },[
  el('div',{class:'dialog-head'},[
   el('div',{},[
    el('span',{class:'assistant-eyebrow'},[icon('mic'),'LANÇAMENTO RÁPIDO POR VOZ']),
    el('h2',{id:'assistant-title'},'Falar Lançamento')
   ]),
   iconBtn('close','Fechar',close)
  ]),
  el('p',{class:'assistant-intro'},'Diga se entrou uma receita ou se teve uma despesa. O sistema adiciona diretamente.'),
  el('label',{for:'assistant-input'},'O que você quer registrar?'),
  input,
  el('div',{class:'assistant-controls'},[
   mic,
   el('div',{class:'assistant-actions'},[
    submitBtn
   ])
  ]),
  status,
  el('div',{class:'assistant-examples','aria-label':'Exemplos rápidos'},
   examples.map(exText=>btn(exText,()=>{
    if(listening)voice.stop();
    input.value=exText;
    result.replaceChildren();
    executeAdd(exText);
   },'ghost'))
  ),
  result
 ]);

 dialog.append(form);
 document.body.append(dialog);
 dialog.showModal();
 input.focus();
 return dialog;
}
