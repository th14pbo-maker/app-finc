import {transactionImpact} from './projection.mjs';
import {parseBrlCents,formatBrlCents,formatBrlDraft} from './currency.mjs';
import {findAvatarPreset} from './profile.mjs';
import {priorityLabel} from './classification.mjs';
export const money=(cents,hidden=false)=>hidden?'••••••':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
export const fmtDate=d=>new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
export const monthLabel=m=>new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(m+'-01T12:00:00Z'));
export function el(tag,attrs={},children=[]){const node=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(v==null||v===false)continue;if(k==='class')node.className=v;else if(k.startsWith('on'))node.addEventListener(k.slice(2).toLowerCase(),v);else if(k==='value')node.value=v;else if(k==='checked')node.checked=v;else node.setAttribute(k,v===true?'':v)}for(const child of [children].flat(Infinity)){if(child!=null&&child!==false)node.append(child instanceof Node?child:document.createTextNode(String(child)))}return node}
const paths={mic:'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5 M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8',bread:'M6 20V11C1 11 1 4 6 4h12c5 0 5 7 0 7v9H6z M9 7l1 2 M14 7l1 2',book:'M12 5v16 M12 5C8 2 4 3 2 4v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-2-1-6-2-10 1',note:'M5 3h14v14l-4 4H5V3z M9 8h6 M9 12h6 M9 16h3 M15 21v-4h4',sun:'M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5L19 19 M5 19l1.5-1.5 M17.5 6.5L19 5',moon:'M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13',dashboard:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',wallet:'M20 8V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v11H5a3 3 0 0 1-3-3V6 M20 12h-5v5h5',card:'M2 7h20 M2 10h20 M4 3h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2 M6 16h3',arrows:'M7 3v18 M3 7l4-4 4 4 M17 21V3 M13 17l4 4 4-4',target:'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20 M12 6a6 6 0 1 0 0 12 6 6 0 1 0 0-12 M12 10a2 2 0 1 0 0 4 2 2 0 1 0 0-4',car:'M5 17H3v-6l3-7h12l3 7v6h-2 M7 17h10 M3 11h18 M7 17a2 2 0 1 0-4 0 2 2 0 1 0 4 0 M21 17a2 2 0 1 0-4 0 2 2 0 1 0 4 0',home:'M3 10l9-8 9 8 M5 8v13h14V8 M9 21v-8h6v8',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 1 0 0-8 M17 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',plus:'M12 5v14 M5 12h14',chevron:'M9 5l7 7-7 7',down:'M5 9l7 7 7-7',up:'M7 17 17 7 M7 7h10v10',arrowDown:'M7 7l10 10 M7 17h10V7',arrowRight:'M4 12h16 M14 6l6 6-6 6',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7 M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6',eyeOff:'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24 M1 1l22 22',search:'M11 3a8 8 0 1 0 0 16 8 8 0 1 0 0-16 M17 17l5 5',close:'M6 6l12 12 M6 18 18 6',upload:'M12 21V9 M7 14l5-5 5 5 M4 19v2h16v-2',download:'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',sparkles:'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z M20 2v4 M18 4h4',shield:'M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6z M8 12l3 3 5-6',bag:'M4 7h16l1 14H3z M8 7V5a4 4 0 0 1 8 0v2',coffee:'M3 8h14v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z M17 8h2a3 3 0 0 1 0 6h-2 M6 2v3 M10 2v3 M14 2v3',briefcase:'M3 7h18v14H3z M8 7V3h8v4 M3 12h18 M10 12v3h4v-3',music:'M9 18V5l12-2v13 M9 18a3 3 0 1 0-6 0 3 3 0 1 0 6 0 M21 16a3 3 0 1 0-6 0 3 3 0 1 0 6 0',heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8',more:'M5 12h.01 M12 12h.01 M19 12h.01',edit:'M16 3l5 5 M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14z',check:'M5 12l4 4L19 6',logout:'M9 3H3v18h6 M9 12h13 M17 7l5 5-5 5',calendar:'M4 5h16v16H4z M8 2v6 M16 2v6 M4 11h16'};
export function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');for(const[k,v]of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round',class:'icon','aria-hidden':'true'}))svg.setAttribute(k,v);const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',paths[name]||paths.wallet);svg.append(p);return svg}
export const btn=(label,onClick,variant='',ico)=>el('button',{type:'button',class:`btn ${variant}`,onClick},[ico&&icon(ico),label]);
export const iconBtn=(name,label,click,cls='')=>el('button',{type:'button',class:('btn ghost icon-btn '+cls).trim(),'aria-label':label,title:label,onClick:click},icon(name));
export const link=(text,route)=>el('a',{href:'#'+route,class:'section-link'},[text,icon('arrowRight')]);
export const panel = (children, cls = '') => {
 const attrs = typeof cls === 'string'
  ? { class: ('panel ' + cls).trim() }
  : { ...cls, class: ('panel ' + (cls.class || '')).trim() };
 return el('section', attrs, children);
};

export const panelHead=(title,sub,action)=>el('div',{class:'panel-head'},[el('div',{},[el('h2',{},title),sub&&el('p',{},sub)]),action]);
export const progress=(percent,color)=>el('div',{class:'progress',role:'progressbar','aria-valuenow':percent,'aria-valuemin':0,'aria-valuemax':100,'aria-label':'Progresso'},el('span',{style:`width:${Math.max(0,Math.min(100,percent))}%;${color?'background:'+color:''}`}));
export const empty=(title,text)=>el('div',{class:'empty'},[icon('wallet'),el('h3',{},title),el('p',{},text)]);
export function moneyControl(value='',attrs={}){
 const {minCents=1,...inputAttrs}=attrs;
 const input=el('input',{type:'text',inputmode:'decimal',placeholder:'0,00',required:true,autocomplete:'off',...inputAttrs,value:value===''?'':formatBrlCents(Math.round(Number(value)*100))});
 const validate=()=>{try{parseBrlCents(input.value,{minCents});input.setCustomValidity('');return true}catch(error){input.setCustomValidity(error.message);return false}};
 input.addEventListener('input',event=>{
  const raw=input.value,caret=input.selectionStart??raw.length;
  const tail=(raw.slice(caret).match(/[0-9,-]/g)||[]).length;
  // A keystroke may shift an automatically inserted thousands separator.
  // Preserve pasted malformed numbers so validation can flag them explicitly.
  const typing=event.inputType?.startsWith('delete')||(event.inputType==='insertText'&&event.data?.length===1);
  const typed=typing&&event.data==='.'?raw.slice(0,caret-1)+','+raw.slice(caret):raw;
  const draft=formatBrlDraft(typing?typed.replaceAll('.',''):typed);
  input.value=draft;
  let pos=draft.length,remaining=tail;
  while(pos>0&&remaining>0){pos--;if(/[0-9,-]/.test(draft[pos]))remaining--;}
  input.setSelectionRange(pos,pos);validate();
 });
 input.addEventListener('blur',()=>{if(validate())input.value=formatBrlCents(parseBrlCents(input.value,{minCents}))});
 return el('span',{class:'money-control'},[el('span',{class:'money-prefix','aria-hidden':'true'},'R$'),input]);
}
export function field(label,name,type='text',value='',options=null,attrs={}){
 const id='field-'+name;
 if(type==='money')return el('div',{class:'field'},[el('label',{for:id},label),moneyControl(value,{id,name,...attrs})]);
 const baseAttrs={id,name,...(type==='number'?{step:'.01'}:{}),...attrs};
 if(options){
  const sel=el('select',baseAttrs,options.map(([v,t])=>el('option',{value:v},t)));
  sel.value=value;
  return el('div',{class:'field'},[el('label',{for:id},label),sel]);
 }
 const input=el('input',{...baseAttrs,type,value,required:true});
 input.value=value;
 if(type==='password'){
  let visible=false;
  const toggleBtn=el('button',{
   type:'button',
   class:'password-toggle-btn',
   'aria-label':'Mostrar senha',
   tabindex:'-1',
   title:'Ver ou ocultar a senha digitada',
   onClick:()=>{
    visible=!visible;
    input.type=visible?'text':'password';
    toggleBtn.setAttribute('aria-label',visible?'Ocultar senha':'Mostrar senha');
    toggleBtn.replaceChildren(icon(visible?'eyeOff':'eye'));
    toggleBtn.classList.toggle('active',visible);
   }
  },[icon('eye')]);
  const wrap=el('div',{class:'password-field-wrap'},[input,toggleBtn]);
  return el('div',{class:'field password-field'},[el('label',{for:id},label),wrap]);
 }
 return el('div',{class:'field'},[el('label',{for:id},label),input]);
}

export function openDialog({title,content,onSubmit,submitLabel='Salvar',danger=false}){const last=document.activeElement;const dialog=el('dialog',{class:'dialog','aria-label':title});const form=el('form');let initial='';const close=()=>{dialog.close();dialog.remove();restoreFocus(last)};const requestClose=()=>{if(onSubmit&&new URLSearchParams(new FormData(form)).toString()!==initial){if(!confirm('Descartar as alterações deste formulário?'))return}close()};const error=el('p',{class:'form-error',role:'alert'});form.append(el('div',{class:'dialog-head'},[el('h2',{},title),iconBtn('close','Fechar',requestClose)]),content,error,el('div',{class:'dialog-actions'},[btn('Cancelar',requestClose),el('button',{class:'btn '+(danger?'danger':'primary'),type:'submit'},submitLabel)]));form.addEventListener('submit',async ev=>{ev.preventDefault();try{const result=await onSubmit(Object.fromEntries(new FormData(form)));if(result===false)return;close()}catch(e){error.textContent=e.message;error.scrollIntoView({block:'nearest'})}});dialog.addEventListener('cancel',e=>{e.preventDefault();requestClose()});dialog.append(form);document.body.append(dialog);initial=new URLSearchParams(new FormData(form)).toString();dialog.showModal();return dialog}
export function toast(message,tone='success'){document.querySelectorAll('.toast').forEach(n=>n.remove());const node=el('div',{class:'toast '+(tone==='error'?'error':''),role:tone==='error'?'alert':'status'},message);document.getElementById('notifications').append(node);setTimeout(()=>node.remove(),6500)}
export function confirmDialog(title,text,onConfirm){openDialog({title,content:el('p',{class:'secondary'},text),submitLabel:'Confirmar',danger:true,onSubmit:onConfirm})}
export function header(title,subtitle,actions=[]){return el('div',{class:'heading'},[el('div',{},[el('h1',{},title),el('p',{},subtitle)]),el('div',{class:'actions'},actions)])}
export const categoryIcon=c=>({'Alimentação':'bread','Moradia':'home','Trabalho':'briefcase','Assinaturas':'music','Saúde':'heart','Transporte':'car','Compras':'bag','Lazer':'sparkles','Educação':'book','Outros':'more','Higiene e cuidados':'shield','Educação e desenvolvimento':'book','Vestuário e acessórios':'bag','Transporte e apoio':'car'}[c]||'arrows');
const categoryStyle=c=>'category-'+categoryIcon(c);
export function transactionImpactNote(t,hidden=false){
 const impact=transactionImpact(t),tone=impact>0?'positive':impact<0?'negative':'muted';
 const text=t.type==='transfer'?'Transferência: efeito neutro no saldo total.':t.type==='cardPayment'?'Pagamento: impacto já considerado na compra.':(impact>0?'Aumenta o saldo futuro em ':'Reduz o saldo futuro em ')+money(Math.abs(impact),hidden)+(t.type==='cardPurchase'?' na previsão da fatura.':'.');
 return el('small',{class:'transaction-impact '+tone},[(impact>0?'↑ ':impact<0?'↓ ':'↔ '),text]);
}
function transactionRow(c,initial,editable){
 let t=initial;const row=el('tr');
 const show=()=>{row.replaceChildren(el('td',{},el('div',{class:'transaction-name'},[el('span',{class:'category-icon '+categoryStyle(t.category)},icon(categoryIcon(t.category))),el('div',{},[editable?el('button',{type:'button',class:'transaction-edit-name','aria-label':'Editar nome de '+t.description,onClick:()=>edit('description')},t.description):el('b',{},t.description),el('small',{},fmtDate(t.date)),t.priority&&el('span',{class:'classification-pill priority-'+t.priority},priorityLabel(t.priority)),t.notes&&el('details',{class:'transaction-notes'},[el('summary',{},[icon('note'),'Observações']),el('p',{},t.notes)])])])),el('td',{class:'mobile-hide'},el('span',{class:'category-pill '+categoryStyle(t.category)},[icon(categoryIcon(t.category)),t.category||'Outros'])),el('td',{class:'desktop-col mobile-hide muted'},c.state.accounts.find(a=>a.id===t.accountId)?.name||c.state.cards.find(a=>a.id===t.cardId)?.name||'—'),el('td',{class:'number '+(t.type==='income'?'positive':'')},editable?el('button',{type:'button',class:'transaction-edit-name number','aria-label':'Editar valor de '+t.description,onClick:()=>edit('amount')},amountLabel()):amountLabel()));row.children[3].append(transactionImpactNote(t,c.state.preferences.hideAmounts));if(editable)row.append(el('td',{},iconBtn('edit','Editar '+t.description,()=>edit('description'))));};
 const amountLabel=()=>(t.type==='income'?'+ ':['expense','cardPurchase'].includes(t.type)?'− ':'')+money(t.amountCents,c.state.preferences.hideAmounts);
 const edit=focus=>{
 const name=el('input',{name:'description',type:'text',value:t.description,required:true,maxlength:140,'aria-label':'Nome da transação'});
 const amountControl=moneyControl(t.amountCents/100,{name:'amount','aria-label':'Valor em reais'});
 const amount=amountControl.querySelector('input');
 const error=el('p',{class:'form-error',role:'alert'});
 const impactPreview=el('div',{class:'inline-impact-preview','aria-live':'polite'});
 const updateImpact=()=>{try{impactPreview.replaceChildren(transactionImpactNote({...t,amountCents:parseBrlCents(amount.value)},c.state.preferences.hideAmounts))}catch{impactPreview.replaceChildren()}};amount.addEventListener('input',updateImpact);updateImpact();
 const cancel=()=>{show();row.querySelector('button')?.focus()};
 const save=()=>{if(!name.reportValidity()||!amount.reportValidity())return;try{if(!name.value.trim())throw Error('Informe o nome da transação.');const next={...t,description:name.value.trim(),amountCents:parseBrlCents(amount.value)};if(c.dispatch('saveTransaction',next)===false)return;t=next;if(row.isConnected){show();row.querySelector('button')?.focus()}}catch(e){error.textContent=e.message}};
 const editor=el('div',{class:'inline-transaction-editor',onKeydown:e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel()}if(e.key==='Enter'&&e.target.tagName==='INPUT'){e.preventDefault();save()}}},[el('label',{},['Nome',name]),el('label',{},['Valor (R$)',amountControl]),impactPreview,el('div',{class:'actions'},[btn('Salvar',save,'primary','check'),btn('Cancelar',cancel,'ghost'),btn('Mais opções',()=>c.openTransaction(t),'ghost')]),error]);
 row.replaceChildren(el('td',{colspan:5},editor));(focus==='amount'?amount:name).focus();(focus==='amount'?amount:name).select();
 };show();return row;
}
export function transactionTable(c,rows,editable=true){if(!rows.length)return empty('Nenhuma transação por aqui','Adicione um lançamento ou ajuste os filtros.');return el('div',{class:'table-wrap'},el('table',{},[el('thead',{},el('tr',{},[el('th',{},'Transação'),el('th',{class:'mobile-hide'},'Categoria'),el('th',{class:'desktop-col mobile-hide'},'Conta'),el('th',{},'Valor'),editable&&el('th',{},'Editar')])),el('tbody',{},rows.map(t=>transactionRow(c,t,editable)))]))}

export function metric(label,value,foot,ico,cls='',footClass='',onClick=null){
 const elAttrs={class:('metric '+(onClick?'metric-interactive ':'')+cls).trim()};
 if(onClick){
  elAttrs.tabIndex=0;
  elAttrs.role='button';
  elAttrs['aria-label']='Editar ou ditar '+label;
  elAttrs.onClick=onClick;
  elAttrs.onKeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onClick(e);}};
 }
 return panel([
  el('div',{class:'metric-top'},[
   label,
   el('span',{class:'metric-top-action'},[
    onClick&&el('button',{
     type:'button',
     class:'metric-hint-btn',
     'aria-label':'Ditar ou editar '+label,
     onClick:e=>{
      e.stopPropagation();
      onClick(e);
     }
    },[icon('mic'),el('span',{},'Ditar')]),
    icon(ico)
   ])
  ]),
  el('div',{class:'metric-value number'},value),
  el('div',{class:('metric-foot '+footClass).trim()},foot)
 ],elAttrs);
}
export function runAction(action,notify=toast){try{return action()}catch(error){notify(error.message,'error');return false}}
export function restoreFocus(previous,fallback=()=>document.getElementById('main')){if(previous?.isConnected)previous.focus();else fallback()?.focus({preventScroll:true})}
export function userAvatar(p,cls=''){const preset=findAvatarPreset(p?.avatarPreset);const name=(p?.displayName||'Você').trim();const words=name.split(/\s+/).filter(Boolean);const initials=words.length>1?(words[0][0]+words[words.length-1][0]).toUpperCase():name.slice(0,2).toUpperCase()||'VO';return el('div',{class:'avatar user-avatar '+cls,'aria-label':'Avatar de '+name},[p?.avatar?el('img',{src:p.avatar,alt:'',class:'avatar-photo'}):preset?el('span',{class:'avatar-emoji','aria-hidden':'true'},preset.emoji):p?.emoji?el('span',{class:'avatar-emoji','aria-hidden':'true'},p.emoji):el('span',{},initials),(p?.avatar||preset)&&p?.emoji&&el('span',{class:'avatar-badge','aria-hidden':'true'},p.emoji)])}
