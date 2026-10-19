import {summary,shiftMonth} from './domain.mjs';
export const chartTypes=[['line','Linha'],['bar','Barras'],['pie','Pizza']];
export function flowSeries(state,month){return Array.from({length:6},(_,i)=>{const m=shiftMonth(month,i-5);return {month:m,...summary(state,m)}})}
export function expenseSlices(state,month){const groups=new Map();for(const t of state.transactions){if(t.date.startsWith(month)&&['expense','cardPurchase'].includes(t.type)){const category=t.category||'Outros';groups.set(category,(groups.get(category)||0)+t.amountCents)}}return [...groups].map(([category,cents])=>({category,cents})).sort((a,b)=>b.cents-a.cents||a.category.localeCompare(b.category,'pt-BR'))}
export function scaleTicks(maxCents){const raw=Math.max(4,maxCents)/4,power=10**Math.floor(Math.log10(raw));const step=[1,2,2.5,5,10].map(n=>n*power).find(n=>n>=raw);return Array.from({length:5},(_,i)=>i*step)}
export function axisLabel(cents){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',notation:cents>=100000?'compact':'standard',maximumFractionDigits:cents>=100000?1:2}).format(cents/100)}
