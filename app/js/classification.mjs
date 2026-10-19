export const priorities=[['essential','Essencial'],['wellbeing','Bem-estar'],['extra','Extra']];
export const macroCategories=['Alimentação','Saúde','Higiene e cuidados','Educação e desenvolvimento','Vestuário e acessórios','Lazer','Transporte e apoio'];
export const tagSuggestions={
 'Cachorro':['cachorro','racao','alimentacao-natural','petiscos','veterinario','vacinas','medicamentos','exames','banho','tosa','tapete-higienico','adestramento','enriquecimento-ambiental','coleira','guia','caminha','roupinha','brinquedos','passeios','transporte-pet','hotel-pet','cuidador-pet'],
 'Filho':['filho','mercado','alimentacao-escolar','lanches','consultas','vacinas','medicamentos','odontologia','fraldas','higiene','corte-de-cabelo','escola','material-escolar','livros','cursos','roupas','calcados','uniforme','brinquedos','passeios','festas','jogos','transporte-escolar','creche','baba']
};
export function parseTags(value){const parts=String(value||'').trim().split(/[\s,;]+/u).filter(Boolean);const tags=[...new Set(parts.map(v=>v.replace(/^#+/,'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase()))];if(tags.length>20||tags.some(t=>!/^[-a-z0-9_]{1,40}$/.test(t)))throw Error('Use até 20 hashtags de até 40 letras, números, hífens ou sublinhados.');return tags}
export function validClassification(t){return (t.priority===undefined||t.priority===''||priorities.some(([v])=>v===t.priority))&&(t.tags===undefined||(Array.isArray(t.tags)&&t.tags.length<=20&&new Set(t.tags).size===t.tags.length&&t.tags.every(tag=>typeof tag==='string'&&/^[-a-z0-9_]{1,40}$/.test(tag))))}
export function matchesClassification(t,{tag='',priority=''}={}){return (!tag||(t.tags||[]).includes(tag))&&(!priority||(priority==='unclassified'?!t.priority:t.priority===priority))}
export function priorityLabel(value){return priorities.find(([v])=>v===value)?.[1]||'Sem classificação'}
