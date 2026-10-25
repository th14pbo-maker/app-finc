export function localConnection(env = process.env) {
 if (env.FINANCE_OS_LOCAL_TEST !== '1') throw new Error('Defina FINANCE_OS_LOCAL_TEST=1 para confirmar uso do ambiente local descartável.');
 if (!env.LOCAL_DATABASE_URL) throw new Error('LOCAL_DATABASE_URL é obrigatória; nenhuma conexão foi aberta.');
 let u; try {u=new URL(env.LOCAL_DATABASE_URL);} catch {throw new Error('LOCAL_DATABASE_URL inválida.');}
 if (!['postgres:','postgresql:'].includes(u.protocol) || !['127.0.0.1','localhost','[::1]'].includes(u.hostname) || u.search || u.hash) {
  throw new Error('Somente PostgreSQL em loopback, sem query string ou fragmento, é permitido.');
 }
 return {connectionString:env.LOCAL_DATABASE_URL,connectionTimeoutMillis:5000};
}
