import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceSession} from '../app/js/speech.mjs';

// Browser boundary only: drive actual adapter callbacks with recognition events.
function setup(){
 const instances=[],states=[],texts=[],errors=[];
 class Recognition{
  constructor(){instances.push(this);this.starts=0;this.stops=0;this.aborts=0;}
  start(){this.starts++;}stop(){this.stops++;}abort(){this.aborts++;}
 }
 const voice=createVoiceSession({Recognition,onState:s=>states.push(s),onText:(s,final)=>texts.push([s,final]),onError:s=>errors.push(s)});
 return {voice,instances,states,texts,errors};
}
test('não inicia sozinho; configura pt-BR e ignora start duplicado',()=>{
 const x=setup();assert.equal(x.instances.length,0);
 x.voice.start();x.voice.start();assert.equal(x.instances.length,1);
 const r=x.instances[0];assert.equal(r.starts,1);assert.equal(r.lang,'pt-BR');assert.equal(r.continuous,false);
 r.onstart();assert.equal(x.states.at(-1),'listening');x.voice.dispose();
});
test('parciais e final só transcrevem; stop e fechamento encerram a sessão',()=>{
 const x=setup();x.voice.start();const r=x.instances[0];r.onstart();
 const result=final=>({results:[Object.assign([{transcript:final?'Gastei 35 reais':'Gastei'}],{isFinal:final})]});
 r.onresult(result(false));r.onresult(result(true));
 assert.deepEqual(x.texts,[['Gastei',false],['Gastei 35 reais',true]]);
 x.voice.stop();assert.equal(r.stops,1);r.onend();assert.equal(x.states.at(-1),'idle');
 x.voice.start();const next=x.instances[1],late=next.onresult;x.voice.dispose();assert.equal(next.aborts,1);
 late(result(true));assert.equal(x.texts.length,2);
});
test('permissão negada informa alternativa e permite nova tentativa',()=>{
 const x=setup();x.voice.start();const r=x.instances[0];
 r.onerror({error:'not-allowed'});r.onend();assert.match(x.errors[0],/permissão/i);assert.equal(x.states.at(-1),'idle');
 x.voice.start();assert.equal(x.instances.length,2);x.voice.dispose();
});
test('sem suporte e erro de início não deixam estado de escuta preso',()=>{
 const errors=[],states=[];const absent=createVoiceSession({onError:e=>errors.push(e),onState:s=>states.push(s)});
 absent.start();assert.match(errors[0],/navegador/i);
 class Broken{start(){throw Error('blocked')}abort(){}}
 const voice=createVoiceSession({Recognition:Broken,onError:e=>errors.push(e),onState:s=>states.push(s)});
 voice.start();assert.equal(states.at(-1),'idle');assert.match(errors.at(-1),/digitar/i);voice.dispose();
});
