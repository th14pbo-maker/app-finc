import {parseBrlCents} from './currency.mjs';
import {balance,today,shiftMonth} from './domain.mjs';
import {projectBalance} from './projection.mjs';

const norm=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const help=message=>({kind:'help',message:message||'Use uma frase por vez, como “Gastei 35 reais com ração hoje”, “Qual meu saldo?” ou “Quanto gastei com alimentação este mês?”. Você também pode usar o formulário manual.'});
const small={zero:0,um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,treze:13,catorze:14,quatorze:14,quinze:15,dezesseis:16,dezessete:17,dezoito:18,dezenove:19,vinte:20,trinta:30,quarenta:40,cinquenta:50,sessenta:60,setenta:70,oitenta:80,noventa:90};
const hundreds={cento:100,duzentos:200,duzentas:200,trezentos:300,trezentas:300,quatrocentos:400,quinhentos:500,seiscentos:600,setecentos:700,oitocentos:800,novecentos:900};
const numberWord=new RegExp(`^(?:${[...Object.keys(small),...Object.keys(hundreds),'cem','mil','e','virgula'].join('|')})$`);
function integer(text){
 text=norm(text);if(/^\d+$/.test(text))return Number(text);
 if(text==='cem')return 100;
 if(Object.hasOwn(hundreds,text))return hundreds[text];
 if(text.includes('mil')){
  const parts=text.split(/\bmil\b/);if(parts.length!==2)return NaN;
  const high=parts[0].trim()?integer(parts[0]):1,low=parts[1].trim()?integer(parts[1].trim().replace(/^e /,'')):0;
  return high>=1&&high<=999&&low>=0&&low<=999?high*1000+low:NaN;
 }
 if(Object.hasOwn(small,text))return small[text];
 const [first,...rest]=text.split(' '),tail=rest.join(' ').replace(/^e /,'');
 if(hundreds[first]&&tail){const n=integer(tail);return n>0&&n<100?hundreds[first]+n:NaN;}
 const pair=text.split(' e ');
 if(pair.length===2&&small[pair[0]]>=20&&small[pair[0]]%10===0&&small[pair[1]]>0&&small[pair[1]]<10)return small[pair[0]]+small[pair[1]];
 return NaN;
}
function numberPrefix(text){
 const numeric=text.match(/^[-+]?\d[\d.,]*/);if(numeric)return numeric[0];
 const tokens=text.split(' '),words=[];for(const token of tokens){if(!numberWord.test(norm(token)))break;words.push(token);}
 if(norm(words.at(-1)||'')==='e')words.pop();return words.join(' ');
}
function amountPrefix(raw){
 let text=raw.trim().replace(/^de\s+/i,'').trim().replace(/^(?:R\$|BRL)\s*/i,'').replace(/^de\s+/i,'').replace(/^\+\s*/,'').trim(),part=numberPrefix(text);
 if(!part)throw Error('Diga o valor logo após “gastei” ou “recebi”. Ex.: “Gastei 35,50 com ração”.');
 let cents;
 if(/^[-+]?\d/.test(part))cents=parseBrlCents(part);
 else{
  const pieces=norm(part).split(' virgula '),whole=integer(pieces[0]);
  let fraction=0;
  if(pieces.length>2)throw Error('Não entendi o valor. Digite, por exemplo, 35,50.');
  if(pieces.length===2){const v=pieces[1];fraction=/^zero \w+$/.test(v)?integer(v.slice(5)):integer(v);if(!v.startsWith('zero ')&&fraction<10)fraction*=10;if(!(fraction>=0&&fraction<100))throw Error('Não entendi os centavos. Digite o valor com vírgula.');}
  cents=whole*100+fraction;
 }
 text=text.slice(part.length).trim();
 const currency=text.match(/^(?:reais|real|brl|contos?|pilas?)\b\s*/i);if(currency)text=text.slice(currency[0].length);
 if(currency&&/^e\s/i.test(text)){
  const match=text.match(/^e\s+(.+?)\s+centavos?\b\s*/i);
  if(match){const cent=integer(match[1]);if(!Number.isInteger(cent)||cent<0||cent>99||cents%100!==0)throw Error('Informe apenas um valor, como “35 reais e 50 centavos”.');cents+=cent;text=text.slice(match[0].length);}
 }
 if(!Number.isSafeInteger(cents)||cents<=0||cents>1e12)throw Error('Informe um valor positivo. Se preferir, digite como 35,50.');
 return {cents,rest:text.trim()};
}
const categoryRules=[
 ['Pets — Ração',/\bracao\b/],['Pets — Petiscos',/\bpetiscos?\b/],['Pets — Veterinário e vacinas',/\bveterinari[oa]\b/],['Pets — Banho e tosa',/\btosa\b/],['Pets',/\b(cachorro|gato|pets?)\b/],
 ['Salário',/\b(salario|ordenado|holerite)\b/],['Renda extra',/\b(freela|freelance|bico|extra|venda|renda)\b/],['Mercado',/\b(mercado|supermercado)\b/],['Lanches',/\b(lanche|lanches|cafe|salgado)\b/],['Restaurantes e delivery',/\b(almoco|jantar|restaurante|delivery|ifood)\b/],['Padaria',/\b(pao|padaria)\b/],
 ['Combustível',/\b(gasolina|combustivel|etanol|diesel)\b/],['Transporte por aplicativo',/\b(uber|taxi)\b/],['Medicamentos',/\b(remedio|farmacia|medicamento)\b/],['Aluguel',/\baluguel\b/],['Energia',/\b(luz|energia)\b/],['Água',/\bagua\b/],['Internet e telefone',/\b(internet|telefone)\b/]
];
const groups={alimentacao:['Alimentação','Mercado','Feira','Restaurantes e delivery','Padaria','Lanches'],pets:['Pets','Pets — Ração','Pets — Petiscos','Pets — Veterinário e vacinas','Pets — Banho e tosa','Pets — Brinquedos e acessórios','Pets — Higiene','Pets — Hotel e cuidador']};
function categoryMatch(text){return categoryRules.find(([,pattern])=>pattern.test(norm(text)))?.[0];}
function dateFrom(text,day){
 let date=day,rest=text;
 if(/\b(anteontem|antes|depois|daqui|ha)\b/.test(norm(rest)))throw Error('Use hoje, ontem, amanhã ou informe a data completa como 24/10/2026.');
 const dates=[...rest.matchAll(/\b(?:hoje|ontem|amanh[ãa])(?=\s|$)|\b\d{1,2}\/\d{1,2}\/\d{4}\b/gi)];
 if(dates.length>1)throw Error('Use apenas uma data por lançamento.');
 if(dates.length){
  const match=dates[0],word=norm(match[0]);
  if(word==='ontem'||word==='amanha'){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+(word==='ontem'?-1:1));date=d.toISOString().slice(0,10);}
  else if(word!=='hoje'){const [d,m,y]=word.split('/');date=`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;}
  if(Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('Essa data não existe. Corrija usando dia/mês/ano.');
  rest=(rest.slice(0,match.index).replace(/\b(?:em|no dia)\s*$/i,'')+' '+rest.slice(match.index+match[0].length)).trim();
 }
 if(/\b(dias?|semanas?|mes|meses|anos?|feira|segunda|terca|quarta|quinta|sexta|sabado|domingo|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|manha|tarde|noite)\b/.test(norm(rest)))throw Error('Nesta etapa, use hoje, ontem, amanhã ou uma data como 24/10/2026.');
 return {date,rest};
}
const cleanTag=raw=>String(raw||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,40);
const INCOME_VERBS='recebi|recebido|recebidos|receber|recebimento|recebimentos|ganhei|ganho|ganhos|ganhar|entrou|entrar|entrada|entradas|entra|caiu|cair|deposito|depósito|depositos|depósitos|depositei|depositar|salario|salário|ordenado|holerite|renda|rendas|faturamento|faturei|lucro';
const EXPENSE_VERBS='gastei|gasto|gastos|gastar|paguei|pago|pagos|pagar|pagamento|pagamentos|comprei|compra|compras|comprar|despesa|despesas|saida|saída|saidas|saídas|custou|custo|custos';
const VERB_REGEX=new RegExp(`^(?:eu\\s+)?(${INCOME_VERBS}|${EXPENSE_VERBS})(?=[\\s,.:;!?-]|$)`,'i');
const INCOME_CHECK=new RegExp(`^(${INCOME_VERBS})$`,'i');
const FILLERS='olha só|olha|tipo assim|tipo|e aí|e ai|aí|ai|quero lançar|quero anotar|queria lançar|queria anotar|preciso lançar|preciso anotar|anota aí|anota ai|anota|anotar|adiciona aí|adiciona ai|adiciona|adicionar|registra aí|registra ai|registra|registrar|lanca aí|lanca ai|lanca|lança aí|lança ai|lança|lancar|lançar|cadastra aí|cadastra|cadastrar|coloque|coloca aí|coloca|bota aí|bota|botar|inclui aí|inclui|incluir|salva aí|salva|salvar|novo|nova|eu|pra ele|para ele|pro assistente|para o assistente|ah|aah|eh|é|ó|entao|então|bom|cara|mano|velho|po|pô|poxa|opa|oh|ola|olá|oi|ei|só|por favor|pfv|pf';
const FILLER_REGEX=new RegExp(`^(?:(?:${FILLERS})(?=[\\s,.:;!?-]|$)[\\s,.:;!?-]*)+`,'i');
function draft(text,state,day){
 let cleaned=text.trim().replace(/^[,\s.:;!?-]+/,'').trim();
 cleaned=cleaned.replace(FILLER_REGEX,'').replace(/^[,\s.:;!?-]+/,'').trim();
 const verb=cleaned.match(VERB_REGEX);
 let isIncome=false,remainder='';
 if(verb){
  isIncome=INCOME_CHECK.test(verb[1]);
  remainder=cleaned.slice(verb[0].length);
 }else{
  const signMatch=cleaned.match(/^([+-])\s*/);
  const rawWithoutSign=signMatch?cleaned.slice(signMatch[0].length):cleaned;
  try{
   const parsed=amountPrefix(rawWithoutSign);
   if(signMatch){
    isIncome=signMatch[1]==='+';
   }else if(/\b(entrada|entradas|receita|receitas|salario|salário|recebimento|ganho|deposito|depósito)\b/i.test(parsed.rest)){
    isIncome=true;
   }else{
    isIncome=false;
   }
   remainder=rawWithoutSign;
  }catch{
   return help();
  }
 }
 if(/\b(cartao|credito|debito|fatura|parcelas?|vezes|transferencia|todo|toda|mensal|semanal|dolares?|euros?|nao)\b/.test(norm(cleaned)))return help('Para cartão, fatura, transferência, recorrência ou outras moedas, use o formulário manual. Aqui preparo uma receita ou despesa única em reais.');
 const {cents,rest:initial}=amountPrefix(remainder);
 let {date,rest}=dateFrom(initial,day),accountId=state.accounts.length===1?state.accounts[0].id:'';
 const account=rest.match(/\bna conta\s+(.+)$/i);
 if(account){const matches=state.accounts.filter(a=>norm(a.name)===norm(account[1]));if(matches.length!==1)throw Error('Não identifiquei essa conta. Use o nome exato cadastrado ou escolha a conta no formulário.');accountId=matches[0].id;rest=rest.slice(0,account.index).trim();}
 
 const tags=[];
 // 1. Spoken hashtags: "hashtag padaria", "tag uber", "com a hashtag thiago"
 rest=rest.replace(/\b(?:com\s+(?:a|as)\s+)?(?:hash\s*tag|tag)s?\s+([a-zA-Z0-9_\u00C0-\u00FF-]+)/gi,(_,t)=>{
  const ct=cleanTag(t);if(ct)tags.push(ct);return '';
 });
 // 2. Written hashtags: "#padaria", "#uber"
 rest=rest.replace(/#([a-zA-Z0-9_\u00C0-\u00FF-]+)/g,(_,t)=>{
  const ct=cleanTag(t);if(ct)tags.push(ct);return '';
 }).replace(/\s+/g,' ').trim();

 const secondAmount=new RegExp(`\\b(?:e|mais)\\s+(?:${[...Object.keys(small),...Object.keys(hundreds),'cem','mil'].join('|')})\\b`);
 if(/\d|\b(mil|milhao|milhoes|bilhao|bilhoes|reais|real|brl|centavos?|gastei|paguei|comprei|recebi|ganhei|menos|virgula)\b/.test(norm(rest))||secondAmount.test(norm(rest)))return help('Não consegui separar o valor do restante da frase. Use um único valor completo, como “Gastei 2.000 reais com aluguel” ou “Gastei 20 reais e 50 centavos com ração”.');
 
 let category='';const custom=rest.match(/\b(?:na )?categoria\s+(.+)$/i);
 if(custom){category=custom[1].trim();if(!category||category.length>80)throw Error('Use um nome de categoria de até 80 caracteres.');rest=rest.slice(0,custom.index).trim();}
 
 // 3. Automatic tags from place or person: "no Thiago", "na padaria", "no posto Ipiranga", "pelo iFood"
 const placeMatches=[...rest.matchAll(/\b(?:no|na|num|numa|em|pelo|pela)\s+([a-zA-Z0-9_\u00C0-\u00FF]+(?:\s+[a-zA-Z0-9_\u00C0-\u00FF]+)?)/gi)];
 for(const m of placeMatches){
  const words=m[1].split(/\s+/);
  for(const word of words){
   const w=norm(word);
   if(['conta','categoria','dia','mes','ano','hoje','ontem','amanha'].includes(w))continue;
   const ct=cleanTag(word);if(ct&&ct.length>=2)tags.push(ct);
  }
 }

 // 4. Known services/keywords: uber, 99, ifood, padaria, mercado, etc.
 const knownServices=['uber','99','99pop','taxi','ifood','rappi','delivery','padaria','mercado','supermercado','farmacia','drogaria','gasolina','combustivel','aluguel','luz','energia','agua','internet','telefone','netflix','spotify','amazon','racao'];
 const normalizedRest=norm(rest);
 for(const kw of knownServices){
  if(new RegExp(`\\b${kw}\\b`,'i').test(normalizedRest)){
   tags.push(cleanTag(kw));
  }
 }

 let description=rest.replace(/^(?:com|de|em|por|para|no|na|do|da|dos|das)\s+/i,'').trim();
 if(!description||/^(entrada|entradas|receita|receitas|saida|saída|saidas|saídas|despesa|despesas|gasto|gastos)$/i.test(description)){
  description=verb&&/salario|salário/i.test(verb[1])?'Salário':(isIncome?'Receita':'Despesa');
 }else if(description.length>140||/\d|\b(reais|real|brl|centavos|gastei|paguei|recebi|ganhei|menos|mais|virgula)\b/.test(norm(description))){
  return help('Informe uma descrição e apenas um valor por vez. Ex.: “Gastei 35 reais com ração hoje”.');
 }
 const defaultCat=(verb&&/salario|salário/i.test(verb[1]))?'Salário':(isIncome?'Renda extra':'Outros');
 const finalTags=[...new Set(tags.filter(t=>/^[-a-z0-9_]{1,40}$/.test(t)))].slice(0,20);
 return {kind:'draft',transaction:{type:isIncome?'income':'expense',amountCents:cents,description,date,category:category||categoryMatch(description)||defaultCat,accountId,priority:'',tags:finalTags},message:'Categoria sugerida; confira também o valor, a data e a conta antes de salvar.'};
}
function period(text,day,month){
 let remaining=text,result=month;
 const suffix=norm(text).match(/\s+(?:(?:neste|nesse|este|esse) mes|(?:no )?mes passado|em (\d{2})\/(\d{4}))$/);
 if(suffix){remaining=text.slice(0,suffix.index);result=suffix[1]?`${suffix[2]}-${suffix[1]}`:suffix[0].includes('passado')?shiftMonth(day.slice(0,7),-1):day.slice(0,7);}
 if(!/^[2-9]\d{3}-(0[1-9]|1[0-2])$/.test(result))throw Error('Use um mês válido, como 10/2026.');
 return {remaining,month:result};
}
export function interpretAssistant(input,state,{day=today(),month=day.slice(0,7)}={}){
 const text=String(input||'').replace(/\s+/g,' ').trim().replace(/[.!?]+$/,'').trim(),clean=norm(text);
 if(!text||text.length>500)return help('Escreva ou fale uma frase de até 500 caracteres.');
 try{
  if(/^(qual (e )?(o )?(meu )?saldo( total| geral)?|meu saldo|saldo)$/.test(clean))return {kind:'answer',title:'Saldo registrado nas contas',valueCents:state.accounts.reduce((sum,a)=>sum+balance(state,a.id),0),detail:'Soma de todas as contas, incluindo lançamentos futuros já cadastrados. Compras no cartão reduzem o saldo quando a fatura é paga.'};
  if(/^(quanto (eu )?gastei|meus gastos|total de gastos)\b/.test(clean)){
   const p=period(text,day,month),tail=norm(p.remaining).replace(/^(quanto (eu )?gastei|meus gastos|total de gastos)/,'').trim();
   if(tail&&!/^(com|em) /.test(tail))return help('Consulte por categoria e mês: “Quanto gastei com alimentação este mês?” ou “Quanto gastei em 09/2026?”.');
   const filter=tail.replace(/^(com|em) /,''),known=[...new Set([...categoryRules.map(([v])=>v),...state.transactions.map(t=>t.category).filter(Boolean)])];
   const exact=known.find(c=>norm(c)===filter),group=groups[filter],alias=categoryMatch(filter);
   // Aliases must match a category name by themselves, not hide unsupported filters.
   const aliasWords=['racao','lanche','lanches','cachorro','gato','salario','mercado','supermercado','gasolina','combustivel','uber','farmacia','remedio','aluguel','energia','luz','agua','internet','telefone','padaria','veterinario'];
   if(filter&&!exact&&!group&&!(alias&&aliasWords.includes(filter)))return help('Não reconheci essa categoria ou período. Use o nome exato da categoria e “este mês”, “mês passado” ou “em 10/2026”.');
   const selected=group||[exact||alias],rows=state.transactions.filter(t=>t.date.startsWith(p.month)&&['expense','cardPurchase'].includes(t.type)&&(!filter||selected.includes(t.category)));
   return {kind:'answer',title:filter?`Gastos com ${exact||filter}`:'Gastos do mês',month:p.month,valueCents:rows.reduce((sum,t)=>sum+t.amountCents,0),detail:`${rows.length} lançamento(s). Inclui compras no cartão; não conta transferências nem pagamentos de fatura novamente.`};
  }
  if(/^(qual (e )?(a )?(minha )?projecao|minha projecao|projecao|como fica (o )?(meu )?saldo futuro)$/.test(clean)){
   const p=projectBalance(state,month,12);return {kind:'answer',title:'Saldo projetado em 12 meses',month,valueCents:p.closingCents,detail:`Até ${p.months.at(-1).month.split('-').reverse().join('/')}, com os lançamentos cadastrados e as faturas previstas. Não presume receitas recorrentes nem rendimentos.`};
  }
  if(/^se (eu )?gastar /.test(clean)){
   const {cents,rest}=amountPrefix(text.replace(/^se (eu )?gastar\s+/i,''));
   if(!/^,?\s*(como fica (o )?(meu )?(futuro|saldo( futuro)?)|qual (o )?impacto)?$/i.test(rest))return help('Simule uma única despesa com “Se eu gastar 200 reais, como fica meu futuro?”.');
   const p=projectBalance(state,day.slice(0,7),12);return {kind:'answer',title:'Saldo em 12 meses com esse gasto',valueCents:p.closingCents-cents,detail:'Simulação de uma despesa única hoje, além dos registros e faturas existentes. Não salva nenhum lançamento e não presume rendimentos.'};
  }
  return draft(text,state,day);
 }catch(error){return help(error.message);}
}
