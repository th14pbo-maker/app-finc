import pg from 'pg';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {localConnection} from './local-connection.mjs';

// Testa no PostgreSQL local real. Não testa login HTTP ou validação de JWT.
export async function runConcurrencyTest() {
 const config=localConnection();
 const clients=[new pg.Client(config),new pg.Client(config),new pg.Client(config)];
 const [admin,a,b]=clients;
 const uid=randomUUID(),email=`concurrency-${uid}@example.invalid`,importId=randomUUID();
 const payload={members:[{id:'me',name:'Teste'}],accounts:[{id:'a',name:'Conta',initialCents:1000,color:'#112233'}],cards:[],goals:[],contributions:[],transactions:[{id:'t',type:'income',description:'Teste',amountCents:125,date:'2026-10-25',accountId:'a',memberId:'me',category:'Outros'}],preferences:{displayName:'Teste',theme:'dark'}};
 let seeded=false,barrier=false,pending;
 try {
  await Promise.all(clients.map(c=>c.connect()));
  await admin.query('BEGIN');
  await admin.query('INSERT INTO public.allowed_emails(email) VALUES($1)',[email]);
  await admin.query("INSERT INTO auth.users(id,email,raw_user_meta_data,role,aud) VALUES($1,$2,'{}','authenticated','authenticated')",[uid,email]);
  await admin.query('COMMIT');seeded=true;
  for(const c of [a,b]) {
   await c.query('BEGIN');await c.query("SET LOCAL statement_timeout='15000ms'");
   await c.query('SET LOCAL ROLE authenticated');
   await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[uid]);
   assert.equal((await c.query('SELECT current_user AS role')).rows[0].role,'authenticated');
  }
  const pids=await Promise.all([a,b].map(async c=>(await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid));
  const lockName=`import_user_state_${uid}`;
  await admin.query('SELECT pg_advisory_lock(hashtext($1))',[lockName]);barrier=true;
  const call=async c=>{try{const res=await c.query('SELECT public.import_user_state($1::jsonb,$2) AS result',[JSON.stringify(payload),importId]);await c.query('COMMIT');return res.rows[0].result;}catch(e){await c.query('ROLLBACK');throw e;}};
  pending=Promise.allSettled([call(a),call(b)]);
  let bothWaiting=false;
  for(let i=0;i<80;i++) {
   const res=await admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND wait_event_type='Lock' AND wait_event='advisory'",[pids]);
   if(res.rows[0].n===2){bothWaiting=true;break;} await delay(50);
  }
  assert.equal(bothWaiting,true,'As duas conexões devem estar sobrepostas e esperando o mesmo advisory lock');
  await admin.query('SELECT pg_advisory_unlock(hashtext($1))',[lockName]);barrier=false;
  const settled=await pending;
  for(const x of settled)if(x.status==='rejected')throw x.reason;
  const [x,y]=settled.map(x=>x.value);assert.equal(x.success,true);assert.deepEqual(x,y);
  for(const [table,n] of [['accounts',1],['members',1],['transactions',1],['import_logs',1]]) {
   const r=await admin.query(`SELECT count(*)::int AS n FROM public.${table} WHERE user_id=$1`,[uid]);assert.equal(r.rows[0].n,n,table);
  }
  assert.equal(Number((await admin.query('SELECT sum(amount_cents) AS total FROM public.transactions WHERE user_id=$1',[uid])).rows[0].total),125);
  console.log('PASS: duas conexões simultâneas confirmadas no banco; uma importação física; valores e respostas conferidos.');
 } finally {
  if(barrier) await admin.query('SELECT pg_advisory_unlock(hashtext($1))',[`import_user_state_${uid}`]).catch(()=>{});
  if(pending)await pending;
  if(seeded){
   for(const table of ['transactions','contributions','accounts','cards','goals','members','import_logs','profiles'])await admin.query(`DELETE FROM public.${table} WHERE user_id=$1`,[uid]);
   await admin.query('DELETE FROM auth.users WHERE id=$1',[uid]);
   await admin.query('DELETE FROM public.allowed_emails WHERE email=$1',[email]);
  }
  await Promise.allSettled(clients.map(c=>c.end()));
 }
}
