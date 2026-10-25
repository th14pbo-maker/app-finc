import {goalProgress,today,shiftMonth} from './domain.mjs';
export function goalInsights(s,id,day=today()){const goal=s.goals.find(g=>g.id===id),p=goalProgress(s,id,day);const daysLeft=Math.round((Date.parse(goal.targetDate+'T12:00:00Z')-Date.parse(day+'T12:00:00Z'))/86400000);const contributions=s.contributions.filter(c=>c.goalId===id);const monthCents=contributions.filter(c=>c.date<=day&&c.date.startsWith(day.slice(0,7))).reduce((n,c)=>n+c.amountCents,0),scheduledCents=contributions.filter(c=>c.date>day).reduce((n,c)=>n+c.amountCents,0);const status=p.remainingCents===0?'complete':daysLeft<0?'overdue':daysLeft<=30?'soon':monthCents===0?'no-contribution':'active';return {...p,daysLeft,monthCents,scheduledCents,status}}
export function goalSeries(s,ids,day=today()){return Array.from({length:6},(_,i)=>{const month=shiftMonth(day.slice(0,7),i-5);return {month,amountCents:s.contributions.filter(c=>ids.includes(c.goalId)&&c.date<=day&&c.date.startsWith(month)).reduce((n,c)=>n+c.amountCents,0)}})}
export function goalTotals(s,goals,day=today()){const totals={savedCents:0,targetCents:0,monthlyCents:0,active:0,complete:0,percent:0};for(const g of goals){const p=goalInsights(s,g.id,day);totals.savedCents+=p.savedCents;totals.targetCents+=g.targetCents;if(p.remainingCents===0)totals.complete++;else{totals.active++;if(p.daysLeft>0)totals.monthlyCents+=p.monthlyCents}}totals.percent=totals.targetCents?Math.min(100,Math.floor(totals.savedCents/totals.targetCents*100)):0;return totals}

export function parseGoalSpeech(rawText) {
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  let text = norm(rawText);

  // Remove common filler words & verbs
  text = text.replace(/^(?:eu\s+)?(?:acabei de\s+)?(?:ganhar|ganhei|guardar|guardei|reservar|reservei|aportar|aportei|colocar|coloquei|botar|botei|adicionar|adicionei|juntar|juntei|receber|recebi|entrou|rendeu|salvei|salvar)\s+/i, '');
  text = text.replace(/^(?:mais|de|um valor de|o valor de|a quantia de)\s+/i, '');

  // Strip currency words
  text = text.replace(/\s*(?:reais|real|brl|contos?|pilas?)\b/gi, '');

  // Check for 'X mil' or 'X mil e Y'
  const milRegex = /^(\d+[\d.,]*)\s*mil(?:\s*(?:e\s*)?(\d+))?/i;
  const matchMil = text.match(milRegex);
  if (matchMil) {
    const high = parseFloat(matchMil[1].replace(/\./g, '').replace(',', '.'));
    const low = matchMil[2] ? parseFloat(matchMil[2].replace(/\./g, '').replace(',', '.')) : 0;
    const totalReais = high * 1000 + low;
    return Math.round(totalReais * 100);
  }

  // Word number map
  const wordMap = {
    um:1, uma:1, dois:2, duas:2, tres:3, quatro:4, cinco:5, seis:6, sete:7, oito:8, nove:9,
    dez:10, onze:11, doze:12, treze:13, catorze:14, quatorze:14, quinze:15, dezesseis:16, dezessete:17, dezoito:18, dezenove:19,
    vinte:20, trinta:30, quarenta:40, cinquenta:50, sessenta:60, setenta:70, oitenta:80, noventa:90,
    cem:100, cento:100, duzentos:200, trezentos:300, quatrocentos:400, quinhentos:500, seiscentos:600, setecentos:700, oitocentos:800, novecentos:900,
    mil:1000
  };

  const wordMilRegex = /^(um|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|quinze|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos)\s+mil(?:\s*(?:e\s*)?(\w+))?/i;
  const wordMatch = text.match(wordMilRegex);
  if (wordMatch) {
    const high = wordMap[wordMatch[1]] || 1;
    const low = wordMatch[2] ? (wordMap[wordMatch[2]] || 0) : 0;
    const totalReais = high * 1000 + low;
    return Math.round(totalReais * 100);
  }

  if (wordMap[text]) {
    return wordMap[text] * 100;
  }

  // Standard numbers
  const numRegex = /^(\d+[\d.,]*)/;
  const numMatch = text.match(numRegex);
  if (numMatch) {
    let raw = numMatch[1];
    if (raw.includes(',') && !raw.includes('.')) {
      raw = raw.replace(',', '.');
      return Math.round(parseFloat(raw) * 100);
    }
    if (raw.includes('.') && raw.includes(',')) {
      raw = raw.replace(/\./g, '').replace(',', '.');
      return Math.round(parseFloat(raw) * 100);
    }
    if (raw.includes('.') && !raw.includes(',')) {
      const parts = raw.split('.');
      if (parts.length === 2 && parts[1].length === 3) {
        return parseInt(parts[0] + parts[1], 10) * 100;
      }
    }
    return Math.round(parseFloat(raw) * 100);
  }

  return null;
}

export function matchGoalFromText(text, goals, defaultGoal = null) {
  if (!goals || !goals.length) return null;
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const nText = norm(text);
  for (const g of goals) {
    if (nText.includes(norm(g.name))) return g;
  }
  return defaultGoal || goals[0];
}
