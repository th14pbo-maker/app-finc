import {priorityExpenses} from '../classification.mjs';
import {chartTypes,flowSeries,expenseSlices,scaleTicks,axisLabel} from '../flow-data.mjs';
import {el,panel,panelHead,money,monthLabel,empty} from '../ui.mjs';
const palette=['#38bdf8','#a78bfa','#34d399','#fb923c','#f472b6','#facc15','#2dd4bf','#60a5fa','#e879f9','#a3e635'];
function svgRoot(label,viewBox){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');for(const [k,v]of Object.entries({viewBox,class:'chart',role:'img','aria-label':label}))svg.setAttribute(k,v);return svg}
function add(svg,tag,attrs,text){const node=document.createElementNS(svg.namespaceURI,tag);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,v);if(text!==undefined)node.textContent=text;svg.append(node);return node}
function trend(c,kind,series){
 const ticks=scaleTicks(Math.max(...series.flatMap(v=>[v.incomeCents,v.expenseCents]))),max=ticks.at(-1),left=102,right=620,top=18,bottom=190;
 const svg=svgRoot(kind==='bar'?'Receitas e despesas em barras nos últimos seis meses. Valores na tabela abaixo.':'Receitas e despesas em linhas nos últimos seis meses. Valores na tabela abaixo.','0 0 650 230');
 const x=i=>left+25+i*(right-left-50)/5,y=v=>bottom-v/max*(bottom-top);
 for(const value of ticks){add(svg,'line',{x1:left,y1:y(value),x2:right,y2:y(value),class:'chart-grid'});add(svg,'text',{x:left-10,y:y(value)+4,'text-anchor':'end'},c.state.preferences.hideAmounts?'•••':axisLabel(value))}
 const colors=['var(--accent)','var(--flow-expense)'];
 ['incomeCents','expenseCents'].forEach((key,k)=>{
  const points=series.map((v,i)=>[x(i),y(v[key])]);
  if(kind==='bar'){for(const[v,i]of series.map((v,i)=>[v,i]))add(svg,'rect',{x:x(i)+(k===0?-19:2),y:y(v[key]),width:17,height:bottom-y(v[key]),rx:3,fill:colors[k]})}
  else{add(svg,'polyline',{points:points.map(p=>p.join(',')).join(' '),fill:'none',stroke:colors[k],'stroke-width':2.5,'stroke-linejoin':'round',...(k===1?{'stroke-dasharray':'6 4'}:{})});for(const [px,py]of points)add(svg,'circle',{cx:px,cy:py,r:3,fill:colors[k]})}
 });
 for(const[v,i]of series.map((v,i)=>[v,i]))add(svg,'text',{x:x(i),y:220,'text-anchor':'middle'},new Date(v.month+'-01T12:00:00Z').toLocaleDateString('pt-BR',{month:'short',timeZone:'UTC'}));
 return el('div',{},[el('div',{class:'chart-legend flow-legend'},[el('span',{},[el('i',{class:'flow-swatch',style:'background:var(--accent)'}),'Receitas']),el('span',{},[el('i',{class:'flow-swatch',style:'background:var(--flow-expense)'}),'Despesas'])]),svg]);
}
function pie(c,slices){
 if(!slices.length)return empty('Nenhuma despesa neste mês','Registre uma despesa ou compra no cartão para ver a divisão por categoria.');
 const total=slices.reduce((n,s)=>n+s.cents,0),svg=svgRoot('Distribuição das despesas por categoria no mês selecionado. Valores e percentuais na lista ao lado.','0 0 240 240');
 let start=-Math.PI/2;
 slices.forEach((slice,i)=>{const angle=slice.cents/total*Math.PI*2,end=start+angle,color=palette[i%palette.length];
  if(slices.length===1)add(svg,'circle',{cx:120,cy:120,r:102,fill:color});
  else add(svg,'path',{d:`M120,120 L${120+102*Math.cos(start)},${120+102*Math.sin(start)} A102,102 0 ${angle>Math.PI?1:0},1 ${120+102*Math.cos(end)},${120+102*Math.sin(end)} Z`,fill:color,stroke:'var(--color-surface)','stroke-width':2});
  start=end;
 });
 return el('div',{class:'flow-pie'},[svg,el('ul',{class:'flow-pie-legend'},slices.map((slice,i)=>el('li',{},[el('i',{class:'flow-swatch',style:'background:'+palette[i%palette.length]}),el('span',{class:'grow'},slice.category),el('span',{class:'number'},c.state.preferences.hideAmounts?'•••':money(slice.cents)+' · '+new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1}).format(slice.cents/total))])))]);
}
function priorityChart(c){
 const rows=priorityExpenses(c.state,c.month),total=rows.reduce((sum,r)=>sum+r.cents,0),hidden=c.state.preferences.hideAmounts;
 if(!total) return null;
 return el('section',{class:'priority-chart','aria-label':'Despesas por prioridade'},[el('h3',{},'Despesas por prioridade'),el('p',{class:'small muted'},'Verde: essencial · Amarelo: não essencial'),...rows.map(r=>el('div',{class:'priority-chart-row'},[el('div',{class:'kv'},[el('span',{},[el('i',{class:'flow-swatch',style:'background:'+r.color}),r.label]),el('span',{class:'number'},hidden?'•••':money(r.cents)+' · '+(total?Math.round(r.cents/total*100):0)+'%')]),el('div',{class:'priority-chart-track','aria-hidden':'true'},el('div',{style:'background:'+r.color+';width:'+(hidden?0:total?r.cents/total*100:0)+'%'}))]))]);
}
export function flowPanel(c,opts={}){
 const kind=chartTypes.some(([value])=>value===c.state.preferences.flowChartType)?c.state.preferences.flowChartType:'line',hidden=c.state.preferences.hideAmounts,series=flowSeries(c.state,c.month),s=series.at(-1),slices=expenseSlices(c.state,c.month);
 const select=el('select',{id:'flow-chart-type','aria-label':'Tipo de gráfico financeiro',onChange:e=>{try{c.dispatch('preferences',{flowChartType:e.target.value});document.getElementById('flow-chart-type')?.focus()}catch(error){e.target.value=kind;c.notify(error.message,'error')}}},chartTypes.map(([value,label])=>el('option',{value},label)));select.value=kind;
 const control=el('label',{class:'flow-chart-control'},[el('span',{},'Visualização'),select]);
 const title=kind==='pie'?'Despesas por categoria':'Fluxo financeiro',sub=kind==='pie'?monthLabel(c.month):'Receitas e despesas nos últimos seis meses';
 const details=kind!=='pie'&&el('details',{class:'flow-values'},[el('summary',{},'Ver valores mês a mês'),el('div',{class:'table-wrap'},el('table',{},[el('thead',{},el('tr',{},['Mês','Receitas','Despesas'].map(label=>el('th',{},label)))),el('tbody',{},series.map(v=>el('tr',{},[el('td',{},monthLabel(v.month)),el('td',{class:'number positive'},money(v.incomeCents,hidden)),el('td',{class:'number negative'},money(v.expenseCents,hidden))])))]))]);
 const noFlow=series.every(v=>v.incomeCents===0&&v.expenseCents===0);
 const priority=priorityChart(c);
 const body=el('div',{class:'flow-body'},[
  el('div',{class:'flow-hero-summary'},[
   el('div',{},[
    el('div',{class:'chart-total number '+(kind!=='pie'?(s.netCents>0?'positive':s.netCents<0?'negative':''):'')},money(kind==='pie'?s.expenseCents:s.netCents,hidden)),
    el('p',{class:'small muted'},kind==='pie'?'Total de despesas do mês selecionado':'Resultado líquido do mês')
   ]),
   control
  ]),
  kind==='pie'?pie(c,slices):noFlow?empty('Sem receitas ou despesas neste período','Registre um lançamento ou escolha outro mês.'):trend(c,kind,series),
  details,
  priority
 ].filter(Boolean));
 if(opts.embedded) return body;
 return panel([panelHead(title,sub),body],'flow-panel');
}
