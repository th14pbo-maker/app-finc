import test from 'node:test';
import assert from 'node:assert/strict';
import {localConnection} from './local-connection.mjs';
test('não abre conexão sem configuração explícita',()=>{assert.throws(()=>localConnection({}),/LOCAL_TEST/);assert.throws(()=>localConnection({FINANCE_OS_LOCAL_TEST:'1'}),/LOCAL_DATABASE_URL/);});
test('rejeita servidor remoto e parâmetros que poderiam mudar o destino',()=>{for(const u of ['postgresql://user:pass@example.com/db','postgresql://user:pass@127.0.0.1/db?host=remote','https://127.0.0.1/db'])assert.throws(()=>localConnection({FINANCE_OS_LOCAL_TEST:'1',LOCAL_DATABASE_URL:u}),/Somente/);});
test('aceita apenas conexão local explícita',()=>{const x=localConnection({FINANCE_OS_LOCAL_TEST:'1',LOCAL_DATABASE_URL:'postgresql://postgres:postgres@127.0.0.1:54322/postgres'});assert.equal(x.connectionTimeoutMillis,5000);});
