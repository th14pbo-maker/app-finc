import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {localConnection} from './local-connection.mjs';
let db;
try {
 const config=localConnection();db=new pg.Client(config);await db.connect();
 const {rows}=await db.query("SELECT to_regprocedure('public.import_user_state(jsonb,text)') AS rpc");
 if(!rows[0].rpc)throw new Error('Aplique primeiro a migração no Supabase LOCAL descartável.');
 const occupied=await db.query("SELECT count(*)::int AS n FROM auth.users WHERE id IN ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222')");
 if(occupied.rows[0].n)throw new Error('IDs de teste já existem. Use um ambiente local novo para não modificar dados existentes.');
 const sql=(await readFile(new URL('../supabase/tests/20261025_test_suite.sql',import.meta.url),'utf8')).replace(/^\\.*$/gm,'');
 await db.query(sql);console.log('PASS: suíte SQL no Supabase local.');
} catch(e){console.error('FAIL:',e.code??'',e.message);process.exitCode=1;}
finally{if(db)await db.end();}
