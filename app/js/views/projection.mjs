import {projectBalance} from '../projection.mjs';
import {el,panel,panelHead,money,monthLabel,icon} from '../ui.mjs';

const tone=n=>n>0?'positive':n<0?'negative':'muted';
const color=n=>n>0?'var(--success)':n<0?'var(--error)':'var(--muted)';
function chart(p){
 const ns='http://www.w3.org/2000/svg';
 const svg=document.createElementNS(ns,'svg');
 for(const [k,v]of Object.entries({viewBox:'0 0 680 245',class:'chart projection-chart',role:'img','aria-label':'Saldo ao fim de cada mês. Verde indica aumento, vermelho redução e cinza estabilidade. Valores completos na tabela abaixo.'}))svg.setAttribute(k,v);
 const add=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;svg.append(n);return n};
 const values=[p.openingCents,...p.months.map(m=>m.balanceCents)];
 const rawMin=Math.min(...values),rawMax=Math.max(...values),pad=Math.max((rawMax-rawMin)*.18,Math.abs(rawMax)*.01,100);
 const min=rawMin-pad,max=rawMax+pad,x=i=>88+i*560/p.months.length,y=v=>190-(v-min)/(max-min)*164;
 for(let i=0;i<5;i++){const v=min+(max-min)*i/4;add('line',{x1:88,x2:648,y1:y(v),y2:y(v),class:'chart-grid'});add('text',{x:78,y:y(v)+4,'text-anchor':'end'},new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(Math.round(v)/100));}
 if(min<0&&max>0)add('line',{x1:88,x2:648,y1:y(0),y2:y(0),stroke:'var(--error)','stroke-dasharray':'4 4'});
 values.forEach((v,i)=>{const delta=i?v-values[i-1]:0;if(i)add('line',{x1:x(i-1),y1:y(values[i-1]),x2:x(i),y2:y(v),stroke:color(delta),'stroke-width':3});const point=add('circle',{cx:x(i),cy:y(v),r:4,fill:color(delta)});const title=document.createElementNS(ns,'title');title.textContent=(i?monthLabel(p.months[i-1].month):'Base inicial')+': '+money(v);point.append(title);if(i===0||i===values.length-1||p.months.length<=6||i%2===1)add('text',{x:x(i),y:220,'text-anchor':'middle'},i?p.months[i-1].month.slice(5)+'/'+p.months[i-1].month.slice(2,4):'Base');});
 return svg;
}

export function projectionPanel(c,opts={}){
 let horizon=12;
 const body=el('div',{class:'projection-body'});
 const select=el('select',{'aria-label':'Horizonte da projeção',onChange:e=>{horizon=Number(e.target.value);draw()}},[3,6,12].map(n=>el('option',{value:n},n+' meses')));select.value=12;
 const draw=()=>{
  const p=projectBalance(c.state,c.month,horizon),hidden=c.state.preferences.hideAmounts;
  body.replaceChildren(...[
   el('div',{class:'projection-summary-minimal'},[
    el('div',{},[
     el('div',{class:'chart-total number '+(p.closingCents<0?'negative':tone(p.netCents))},money(p.closingCents,hidden)),
     el('p',{class:'small muted'},'Previsão em '+horizon+' meses • '+(p.netCents>=0?'+':'')+money(p.netCents,hidden)+' no período')
    ]),
    el('div',{class:'projection-mini-kpis'},[
     el('div',{},[el('span',{class:'small muted'},'Entradas'),el('strong',{class:'number positive'},'+ '+money(p.incomeCents,hidden))]),
     el('div',{},[el('span',{class:'small muted'},'Saídas/Faturas'),el('strong',{class:'number negative'},'− '+money(p.expenseCents,hidden))]),
     el('label',{class:'flow-chart-control horizon-control'},[el('span',{},'Horizonte'),select])
    ])
   ]),
   el('div',{class:'chart-legend flow-legend'},[['Saldo sobe','var(--success)'],['Saldo cai','var(--error)'],['Estável','var(--muted)']].map(([label,shade])=>el('span',{},[el('i',{class:'flow-swatch',style:'background:'+shade}),label]))),
   hidden?el('p',{class:'small muted'},'Exiba os valores para visualizar a curva do saldo.'):chart(p),
   p.months.some(m=>m.balanceCents<0)&&el('p',{class:'notice projection-warning'},[icon('wallet'),'A projeção indica saldo negativo em pelo menos um mês. Revise as saídas e receitas previstas.']),
   el('details',{class:'flow-values'},[el('summary',{},'Ver projeção mês a mês'),el('div',{class:'table-wrap'},el('table',{},[el('thead',{},el('tr',{},['Mês','Entradas','Saídas e faturas','Saldo previsto'].map(v=>el('th',{},v)))),el('tbody',{},p.months.map(m=>el('tr',{},[el('td',{},monthLabel(m.month)),el('td',{class:'number positive'},money(m.incomeCents,hidden)),el('td',{class:'number negative'},money(m.expenseCents,hidden)),el('td',{class:'number '+(m.balanceCents<0?'negative':tone(m.changeCents))},money(m.balanceCents,hidden))])))]))])
  ].filter(Boolean));
 };draw();
 if(opts.embedded) return body;
 return panel([panelHead('Seu saldo no futuro','Veja como suas escolhas alteram os próximos meses.',el('label',{class:'flow-chart-control'},[el('span',{},'Projetar'),select])),body],'projection-panel');
}
