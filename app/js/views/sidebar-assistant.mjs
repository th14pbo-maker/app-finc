import {interpretAssistant} from '../assistant.mjs';
import {createVoiceSession} from '../speech.mjs';
import {el,icon,money} from '../ui.mjs';

export function renderSidebarAssistant(c){
 const Recognition=typeof window!=='undefined'?(window.SpeechRecognition||window.webkitSpeechRecognition):null;
 let listening=false,currentTranscript='',feedbackTimeout=null,mode=Recognition?'voice':'text';
 const card=el('div',{class:'sidebar-assistant-card'});

 function processInput(rawText){
  const text=String(rawText||'').trim();
  if(!text)return;
  showFeedback('processing','Processando…');
  try{
   const response=interpretAssistant(text,c.state,{month:c.month});
   if(response.kind==='help'){
    showFeedback('error',response.message);
    return;
   }
   if(response.kind==='answer'){
    const formatted=money(response.valueCents,c.state.preferences.hideAmounts);
    showFeedback('answer',response.title,formatted);
    return;
   }
   if(response.kind==='draft'){
    const t=response.transaction;
    if(!c.state.accounts.length){
     showFeedback('error','Cadastre uma conta antes de lançar.');
     c.notify('Cadastre uma conta antes de lançar.','error');
     return;
    }
    const accountId=t.accountId||c.state.accounts[0].id;
    const account=c.state.accounts.find(a=>a.id===accountId)||c.state.accounts[0];
    const payload={
     id:null,
     description:t.description,
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
    const isIncome=t.type==='income';
    const typeLabel=isIncome?'Entrada':'Saída';
    const formattedAmount=money(t.amountCents,false);
    const successTitle=`✓ ${typeLabel} de ${formattedAmount} adicionada!`;
    const tagsBadge=t.tags?.length ? ' • ' + t.tags.map(tag=>'#'+tag).join(' ') : '';
    const detail=`${t.description} • ${t.category} (${account.name})${tagsBadge}`;
    showFeedback('success',successTitle,detail,isIncome);
    c.notify(`${typeLabel} de ${formattedAmount} adicionada com sucesso!`,'positive');
   }
  }catch(err){
   showFeedback('error',err.message||'Não foi possível processar.');
  }
 }

 const voice=createVoiceSession({
  Recognition,
  onState:state=>{
   listening=state!=='idle';
   updateUI();
   if(state==='idle'&&currentTranscript){
    const toProcess=currentTranscript;
    currentTranscript='';
    processInput(toProcess);
   }
  },
  onText:(text,isFinal)=>{
   currentTranscript=text;
   showLiveText(text);
   if(isFinal)voice.stop();
  },
  onError:message=>{
   showFeedback('error',message);
  }
 });

 function showFeedback(type,title,detail='',isIncome=false){
  clearTimeout(feedbackTimeout);
  const container=card.querySelector('.sidebar-assistant-feedback-box');
  if(!container)return;
  container.replaceChildren(
   el('div',{class:`sidebar-assistant-feedback ${type} ${isIncome?'income':''}`},[
    el('strong',{},title),
    detail&&el('span',{class:'small'},detail)
   ])
  );
  if(type==='success'||type==='answer'){
   feedbackTimeout=setTimeout(()=>{
    if(container)container.replaceChildren();
   },6000);
  }
 }

 function showLiveText(text){
  const container=card.querySelector('.sidebar-assistant-feedback-box');
  if(!container)return;
  container.replaceChildren(
   el('div',{class:'sidebar-assistant-live'},[
    el('span',{class:'status-dot listening-dot'}),
    el('span',{},`“${text}”`)
   ])
  );
 }

 function updateUI(){
  const head=el('div',{class:'sidebar-assistant-head'},[
   el('div',{class:`accent-badge ${listening?'is-listening':''}`},[icon('mic')]),
   el('div',{},[
    el('strong',{},'Assistente'),
    el('span',{class:'status-indicator'},listening?'Ouvindo agora…':'Voz e texto')
   ])
  ]);

  const desc=el('p',{class:'sidebar-assistant-desc'},'Fale ou digite entradas e saídas rápidas.');

  let actionElement;
  if(mode==='voice'&&Recognition){
   const micBtn=el('button',{
    type:'button',
    class:`btn primary sidebar-assistant-btn ${listening?'is-listening':''}`,
    'aria-label':listening?'Parar escuta':'Falar lançamento',
    onClick:()=>{
     if(listening){
      voice.stop();
     }else{
      const box=card.querySelector('.sidebar-assistant-feedback-box');
      if(box)box.replaceChildren();
      voice.start();
     }
    }
   },[
    icon('mic'),
    el('span',{},listening?'Ouvindo… toque para concluir':'Falar lançamento')
   ]);
   actionElement=micBtn;
  }else{
   const input=el('input',{
    type:'text',
    class:'sidebar-assistant-input',
    placeholder:'Ex.: Gastei 10 BRL na padaria…',
    'aria-label':'Digitar lançamento ou consulta'
   });
   const submitBtn=el('button',{
    type:'submit',
    class:'btn primary sidebar-assistant-submit-btn',
    'aria-label':'Lançar'
   },[icon('check')]);
   const form=el('form',{
    class:'sidebar-assistant-input-row',
    onSubmit:e=>{
     e.preventDefault();
     const val=input.value.trim();
     if(!val)return;
     input.value='';
     processInput(val);
    }
   },[input,submitBtn]);
   actionElement=form;
  }

  const toggleRow=el('div',{class:'sidebar-assistant-mode-toggle'},[
   Recognition&&el('button',{
    type:'button',
    onClick:()=>{
     if(listening)voice.stop();
     mode=mode==='voice'?'text':'voice';
     updateUI();
    }
   },mode==='voice'?'⌨ ou digite aqui':'🎤 ou use o microfone')
  ]);

  const feedbackBox=card.querySelector('.sidebar-assistant-feedback-box')||el('div',{class:'sidebar-assistant-feedback-box'});

  card.replaceChildren(head,desc,actionElement,toggleRow,feedbackBox);
 }

 updateUI();
 return card;
}
