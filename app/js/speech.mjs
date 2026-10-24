const errors={
 'not-allowed':'O microfone está sem permissão. Você pode liberar o acesso nas configurações do navegador ou digitar abaixo.',
 'service-not-allowed':'O reconhecimento de voz não está disponível neste navegador. Continue digitando.',
 'audio-capture':'Não encontrei um microfone disponível. Confira a conexão ou digite sua frase.',
 'no-speech':'Não consegui ouvir uma frase. Tente novamente ou digite abaixo.',
 network:'O serviço de voz não respondeu. Confira a internet ou continue digitando.',
 'language-not-supported':'Este navegador não reconhece voz em português. Continue digitando.'
};
export function createVoiceSession({Recognition,onState=()=>{},onText=()=>{},onError=()=>{}}={}){
 let active=null,disposed=false,limit=null,finish=null;
 const clear=()=>{clearTimeout(limit);clearTimeout(finish);limit=finish=null;};
 const release=r=>{if(active!==r)return;clear();active=null;onState('idle');};
 const stop=()=>{
  const r=active;if(!r)return;
  clearTimeout(limit);onState('stopping');
  try{r.stop();finish=setTimeout(()=>{if(active===r){r.abort();release(r);}},3000);}catch{try{r.abort();}catch{}release(r);}
 };
 return {
  start(){
   if(disposed||active)return;
   if(!Recognition){onError('Este navegador não oferece reconhecimento de voz. Você pode digitar normalmente.');return;}
   let r;
   try{
    r=new Recognition();active=r;r.lang='pt-BR';r.continuous=false;r.interimResults=true;r.maxAlternatives=1;
    onState('starting');
    r.onstart=()=>{if(active===r&&!disposed)onState('listening');};
    r.onresult=event=>{if(active!==r||disposed)return;const results=Array.from(event.results),text=results.map(item=>item[0]?.transcript||'').join(' ').trim();if(text)onText(text,results.every(item=>item.isFinal));};
    r.onspeechend=()=>{if(active===r&&!disposed)stop();};
    r.onerror=event=>{if(active!==r||disposed)return;if(event.error!=='aborted')onError(errors[event.error]||'Não consegui reconhecer a fala. Tente novamente ou digite abaixo.');release(r);};
    r.onend=()=>{if(!disposed)release(r);};
    r.start();limit=setTimeout(stop,20000);
   }catch{if(r){try{r.abort();}catch{}}clear();active=null;onError('Não foi possível iniciar o microfone. Você pode digitar abaixo.');onState('idle');}
  },
  stop,
  dispose(){disposed=true;clear();const r=active;active=null;if(r){try{r.abort();}catch{}}}
 };
}
