export const priorities=[['essential','Essencial'],['non_essential','Não essencial']];
export const macroCategories=['Mercado','Alimentação','Restaurantes e delivery','Moradia','Água','Energia','Internet e telefone','Saúde','Medicamentos','Higiene e cuidados','Educação','Material escolar','Filhos e família','Creche e babá','Vestuário e acessórios','Lazer','Viagens','Transporte','Combustível','Manutenção do veículo','Pets','Pets — Ração','Pets — Petiscos','Pets — Veterinário e vacinas','Pets — Banho e tosa','Pets — Brinquedos e acessórios','Pets — Higiene','Pets — Hotel e cuidador','Trabalho','Assinaturas','Compras','Presentes e doações','Impostos e taxas','Salário','Renda extra','Outros'];
export const tagSuggestions={
 'Cachorro':['cachorro','racao','alimentacao-natural','petiscos','veterinario','vacinas','medicamentos','exames','banho','tosa','tapete-higienico','adestramento','enriquecimento-ambiental','coleira','guia','caminha','roupinha','brinquedos','passeios','transporte-pet','hotel-pet','cuidador-pet'],
 'Filho':['filho','mercado','alimentacao-escolar','lanches','consultas','vacinas','medicamentos','odontologia','fraldas','higiene','corte-de-cabelo','escola','material-escolar','livros','cursos','roupas','calcados','uniforme','brinquedos','passeios','festas','jogos','transporte-escolar','creche','baba']
};
export function parseTags(value){const parts=String(value||'').trim().split(/[\s,;]+/u).filter(Boolean);const tags=[...new Set(parts.map(v=>v.replace(/^#+/,'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase()))];if(tags.length>20||tags.some(t=>!/^[-a-z0-9_]{1,40}$/.test(t)))throw Error('Use até 20 hashtags de até 40 letras, números, hífens ou sublinhados.');return tags}
export function validClassification(t){return (t.priority===undefined||t.priority===''||['essential','non_essential','wellbeing','extra'].includes(t.priority))&&(t.tags===undefined||(Array.isArray(t.tags)&&t.tags.length<=20&&new Set(t.tags).size===t.tags.length&&t.tags.every(tag=>typeof tag==='string'&&/^[-a-z0-9_]{1,40}$/.test(tag))))}
export function matchesClassification(t,{tag='',priority=''}={}){
 const p=['wellbeing','extra'].includes(t.priority)?'non_essential':(t.priority||'');
 return (!tag||(t.tags||[]).includes(tag))&&(!priority||(priority==='unclassified'?!t.priority:p===priority));
}
export function priorityLabel(value){
 if(value==='essential')return 'Essencial';
 if(['non_essential','wellbeing','extra'].includes(value))return 'Não essencial';
 return 'Sem classificação';
}

export function priorityExpenses(state,month){
 const buckets=[['essential','Essencial','var(--success)'],['non_essential','Não essencial','var(--warning)'],['','Sem classificação','var(--muted)']].map(([id,label,color])=>({id,label,color,cents:0}));
 for(const t of state.transactions){
  if(!t.date.startsWith(month)||!['expense','cardPurchase'].includes(t.type))continue;
  const p=['wellbeing','extra','non_essential'].includes(t.priority)?'non_essential':(t.priority||'');
  const bucket=buckets.find(b=>b.id===p)||buckets[2];
  bucket.cents+=t.amountCents;
 }
 return buckets;
}
