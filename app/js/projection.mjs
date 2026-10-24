import {invoice,invoiceMonth,shiftMonth,dateAt} from './domain.mjs';

export function transactionImpact(t){
 if(t.type==='income')return t.amountCents;
 if(['expense','cardPurchase'].includes(t.type))return -t.amountCents;
 return 0;
}

// Cash forecast based only on the recorded ledger. No assumed recurrence/returns.
// Historical card payments belong to the opening cash balance. Future payments
// and the residual invoice are reserved no later than the invoice's due date.
export function projectBalance(state,startMonth,horizon=12){
 const start=startMonth+'-01';
 let openingCents=state.accounts.reduce((sum,a)=>sum+a.initialCents,0);
 const events=[];
 for(const t of state.transactions){
  const cash=t.type==='income'?t.amountCents:['expense','cardPayment'].includes(t.type)?-t.amountCents:0;
  if(t.date<start)openingCents+=cash;
  else if(['income','expense'].includes(t.type))events.push({date:t.date,cents:cash});
 }
 for(const card of state.cards){
  const billingMonths=new Set(state.transactions.filter(t=>t.cardId===card.id&&t.type==='cardPurchase').map(t=>invoiceMonth(card,t.date)));
  for(const month of billingMonths){
   const inv=invoice(state,card.id,month),due=inv.dueDate<start?start:inv.dueDate;
   const payments=state.transactions.filter(t=>t.type==='cardPayment'&&t.cardId===card.id&&t.invoiceMonth===month&&t.date>=start);
   for(const payment of payments)events.push({date:payment.date<due?payment.date:due,cents:-payment.amountCents});
   if(inv.dueCents>0)events.push({date:due,cents:-inv.dueCents});
  }
 }
 let balanceCents=openingCents,incomeCents=0,expenseCents=0;
 const months=Array.from({length:horizon},(_,i)=>{
  const month=shiftMonth(startMonth,i),entries=events.filter(e=>e.date.startsWith(month));
  const income=entries.reduce((sum,e)=>sum+Math.max(0,e.cents),0),expense=entries.reduce((sum,e)=>sum+Math.max(0,-e.cents),0);
  incomeCents+=income;expenseCents+=expense;balanceCents+=income-expense;
  return {month,date:dateAt(month,31),balanceCents,incomeCents:income,expenseCents:expense,changeCents:income-expense};
 });
 return {openingCents,months,incomeCents,expenseCents,netCents:incomeCents-expenseCents,closingCents:balanceCents};
}
