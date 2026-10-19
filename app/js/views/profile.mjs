import {el,btn,field,userAvatar,runAction} from '../ui.mjs';
import {readAvatar,validateProfileMedia,avatarPresets} from '../profile.mjs';
export function profileForm(c){
 let avatar=c.state.preferences.avatar||'',avatarPreset=c.state.preferences.avatarPreset||'',busy=false;
 const nameField=field('Como você quer ser chamado?','displayName','text',c.state.preferences.displayName);
 const nameInput=nameField.querySelector('input');nameInput.maxLength=60;
 const emojiField=field('Emoji pessoal (opcional)','emoji','text',c.state.preferences.emoji||'');
 const emojiInput=emojiField.querySelector('input');emojiInput.required=false;emojiInput.maxLength=32;emojiInput.placeholder='Ex.: 🌿';emojiInput.setAttribute('aria-describedby','emoji-help');
 emojiField.append(el('small',{id:'emoji-help'},'Escolha abaixo ou insira um emoji. Com foto ou avatar pronto, ele aparece como um pequeno detalhe.'));
 const preview=el('div',{class:'profile-preview'}),presetButtons=[];
 const updatePreview=()=>{preview.replaceChildren(userAvatar({displayName:nameInput.value||'Você',avatar,avatarPreset,emoji:emojiInput.value},'avatar-large'));for(const button of presetButtons)button.setAttribute('aria-pressed',String(!avatar&&button.dataset.preset===avatarPreset));};
 const status=el('p',{class:'small muted',role:'status','aria-live':'polite'},'Escolha um avatar pronto ou uma foto JPG, PNG ou WebP de até 5 MB.');
 const file=el('input',{type:'file',accept:'image/jpeg,image/png,image/webp',class:'hide','aria-label':'Escolher foto de perfil'});
 const upload=btn('Escolher foto',()=>file.click());
 const remove=btn('Remover foto',()=>{avatar='';file.value='';remove.disabled=true;updatePreview()},'ghost');remove.disabled=!avatar;
 const initials=btn('Usar iniciais',()=>{avatar='';avatarPreset='';emojiInput.value='';file.value='';remove.disabled=true;updatePreview();status.textContent='Iniciais selecionadas. Clique em Salvar perfil para aplicar.'},'ghost');
 const choices=el('fieldset',{class:'avatar-choices'},[el('legend',{},'Escolha seu avatar'),el('p',{class:'small muted'},'Mulheres e homens em diferentes tons de pele e cabelos. Selecione e depois salve o perfil.')]);
 for(const [title,presets] of [['Mulheres',avatarPresets.slice(0,6)],['Homens',avatarPresets.slice(6)]]){
  choices.append(el('h4',{class:'avatar-group-title'},title),el('div',{class:'avatar-options'},presets.map(p=>{const button=el('button',{type:'button',class:'avatar-option','data-preset':p.id,'aria-label':p.label,title:p.label,'aria-pressed':'false',onClick:()=>{avatar='';avatarPreset=p.id;remove.disabled=true;file.value='';updatePreview();status.textContent=p.label+' selecionado. Clique em Salvar perfil para aplicar.'}},[el('span',{'aria-hidden':'true'},p.emoji)]);presetButtons.push(button);return button})));
 }
 const save=el('button',{type:'submit',class:'btn primary'},'Salvar perfil');
 const form=el('form',{},[el('div',{class:'profile-identity'},[preview,el('div',{class:'grow'},[el('h3',{},'Seu avatar'),el('div',{class:'actions profile-photo-actions'},[upload,remove,initials]),status,file])]),choices,nameField,emojiField,el('div',{class:'emoji-options','aria-label':'Sugestões de emoji'},[['😀','Sorriso'],['😎','Óculos de sol'],['🚀','Foguete'],['🌿','Folha'],['💎','Diamante'],['🐱','Gato'],['🦊','Raposa'],['🌻','Girassol'],['💙','Coração azul'],['✨','Brilhos'],['🏆','Troféu'],['☕','Café']].map(([value,label])=>el('button',{type:'button',class:'emoji-option','aria-label':label,title:label,onClick:()=>{emojiInput.value=value;updatePreview()}},value))),btn('Sem emoji',()=>{emojiInput.value='';updatePreview()},'ghost'),el('div',{class:'profile-save'},save)]);
 nameInput.addEventListener('input',updatePreview);emojiInput.addEventListener('input',updatePreview);
 file.addEventListener('change',async()=>{const selected=file.files?.[0];if(!selected)return;busy=true;file.disabled=true;upload.disabled=true;remove.disabled=true;initials.disabled=true;choices.disabled=true;save.disabled=true;status.textContent='Preparando sua foto…';try{const nextAvatar=await readAvatar(selected);avatar=nextAvatar;avatarPreset='';updatePreview();status.textContent='Foto pronta. Clique em Salvar perfil para aplicar.'}catch(error){status.textContent=error.message;c.notify(error.message,'error')}finally{busy=false;file.disabled=false;upload.disabled=false;remove.disabled=!avatar;initials.disabled=false;choices.disabled=false;save.disabled=false;file.value=''}});
 form.addEventListener('submit',event=>{event.preventDefault();if(busy)return;runAction(()=>{const displayName=nameInput.value.trim(),emoji=emojiInput.value.trim();if(!displayName)throw Error('Informe seu nome.');const errors=validateProfileMedia({emoji,avatar,avatarPreset});if(errors.length)throw Error(errors.join('\n'));return c.dispatch('preferences',{displayName,emoji,avatar,avatarPreset})},c.notify)});
 updatePreview();return form;
}
