import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const read = p => readFile(new URL(p,import.meta.url),'utf8');
const db = new PGlite({extensions:{pgcrypto}});
try {
 console.log((await db.query('SELECT version()')).rows[0].version);
 console.log('Modo: PostgreSQL embarcado descartável; Auth mínimo de teste, sem API HTTP.');
 await db.exec(await read('./auth-fixture.sql'));
 const migration=await read('../supabase/migrations/20261025000000_supabase_schema.sql');
 await db.exec(migration);
 assert.equal((await db.query("SELECT to_regprocedure('public.record_import_log_step(text,text,text,jsonb,text)') AS f")).rows[0].f,null);
 console.log('PASS: migração aplicada; função privilegiada antiga removida');
 await db.exec(migration);
 console.log('PASS: reaplicação da migração sem erro');
 const suite=(await read('../supabase/tests/20261025_test_suite.sql')).replace(/^\\.*$/gm,'');
 await db.exec(suite);
 console.log('PASS: 8 cenários SQL (incluindo importação, repetição, RLS, rollback, privilégios e objeto temporário hostil)');
 console.log('NÃO EXECUTADO neste motor: concorrência entre conexões e autenticação HTTP Supabase.');
} catch(e) { console.error('FAIL:',e.code ?? '',e.message); if(e.where)console.error(e.where); process.exitCode=1; }
finally { await db.close(); }
