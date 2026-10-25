# Finance OS — correções de banco e importação

Este pacote corrige os arquivos da primeira etapa enviados no relatório de 25/10/2026, às 02:14 (Brasília). Não é o projeto completo. Não altera login, telas, sincronização, Vercel ou o Supabase remoto.

## O que foi feito

- Remapeamento de IDs em variáveis JSONB locais, sem reutilizar tabelas temporárias do chamador dentro da função privilegiada.
- Identidade financeira derivada de `auth.uid()`, hash calculado no banco, importação transacional e trava por usuário preservados.
- `search_path` sem o schema público; chamadas de extensão qualificadas; funções obsoletas removidas.
- Privilégios das tabelas explicitamente revogados e concedidos novamente, inclusive para `authenticated`.
- Preparação dos testes com convites antes dos usuários, checagem de RLS com dados presentes e rollback verificado antes do rollback externo.
- Correção de datas de calendário inválidas e compatibilidade de `notes: null` no validador JavaScript.
- Teste de concorrência por duas conexões PostgreSQL, com confirmação de que ambas estão esperando a mesma trava, conferência de registros e limpeza do usuário de teste. Esse teste ainda NÃO foi executado contra servidor nativo.

## Resultado verificado aqui

| Verificação | Resultado |
|---|---|
| Migração em PostgreSQL 18.6 embarcado / PGlite 0.5.11 | Passou |
| Reaplicação da migração e remoção de função antiga | Passou |
| 8 cenários SQL de integração | Passaram |
| 5 testes JavaScript de payload e regressão | Passaram |
| 3 testes das restrições de conexão local | Passaram |
| Concorrência em duas conexões de servidor nativo | Não executada |
| Supabase Auth/GoTrue, JWT assinado, PostgREST e fluxo HTTP | Não executados |
| 33 testes originais do aplicativo completo | Não disponíveis neste pacote; não executados aqui |

O PGlite executa PostgreSQL real compilado para WebAssembly, incluindo RLS, permissões, constraints, funções e transações. Para esta verificação, `auth.users`, `auth.uid()` e roles foram preparados por um fixture mínimo: isto NÃO reproduz o serviço Supabase Auth nem verifica assinatura de JWT. Não substitui a validação final em Supabase local.

Os resultados estão em `verification/evidence/`. Arquivos `*-before.txt` e `baseline.txt` são reproduções de erros ANTES da correção. `database.txt`, `client.txt` e `guards.txt` contêm a verificação final.

## Repetir os testes já executados (sem Docker)

Requer Node.js 22 ou mais recente e npm. Testado com Node 24.22.1. No terminal, dentro da pasta deste pacote:

```powershell
npm --prefix verification ci
npm --prefix verification test
npm --prefix verification run test:client
npm --prefix verification run test:guards
```

O banco embarcado é novo, descartável e não abre conexão com seu Supabase.

## Aplicar ao projeto original

1. Use a branch `feature/supabase-auth` e preserve as alterações locais existentes.
2. Compare os arquivos do pacote com os do projeto; não substitua o projeto inteiro. O pacote inclui apenas os cinco arquivos extraídos do relatório e os arquivos de verificação novos.
3. `correcoes.patch` contém as diferenças de código em relação EXATAMENTE ao último relatório enviado. Na raiz do repositório, execute `git apply --check caminho/para/correcoes.patch`. Somente se a verificação passar, aplique com `git apply caminho/para/correcoes.patch`. Se falhar, compare manualmente: o código real pode ter divergido do relatório.
4. Copie `verification/` e `LEIA-ME.md` se optar por copiar arquivos em vez de aplicar o patch. Não copie `node_modules`.
5. Execute também a suíte completa original do aplicativo. Aqui só estavam disponíveis os testes incluídos nos relatórios.

A migração mantém o nome existente porque, segundo o histórico, nunca foi aplicada no Supabase remoto. Se ela JÁ tiver sido aplicada em algum banco, não reescreva o histórico: prepare uma migração incremental adequada àquele schema. `CREATE TABLE IF NOT EXISTS` não atualiza tabelas antigas.

A extensão pgcrypto precisa estar no schema `extensions`. Se ela já estiver em outro schema, a migração para com mensagem explícita, sem mover extensões silenciosamente.

## Validação final em Supabase local — pendente

Use um ambiente LOCAL descartável. Não use dados reais. O pacote não faz push ou deploy e seus executores nativos rejeitam URLs remotas.

Com Docker Desktop ativo, instale a CLI no projeto, se necessário, e confira se `supabase/config.toml` existe:

```powershell
npm install --save-dev supabase
# Execute init SOMENTE se ainda não houver configuração local:
npx supabase init
npx supabase start
```

Em um ambiente NOVO e descartável, aplique a migração local conforme a configuração da CLI. `npx supabase db reset --local` recria o banco LOCAL e APAGA dados locais: use apenas no ambiente de testes descartável. Não use `--linked` ou URL remota.

Depois, na raiz do pacote/projeto que contém `verification/`:

```powershell
$env:FINANCE_OS_LOCAL_TEST = '1'
# Exemplo padrão LOCAL. Use a conexão local real mostrada pela CLI; não envie credenciais no chat.
$env:LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
npm --prefix verification run test:local
npm --prefix verification run test:concurrency
```

Esses executores usam `pg` e não exigem `psql` instalado no Windows. A suíte SQL também pode ser executada diretamente por `psql -v ON_ERROR_STOP=1 -f supabase/tests/20261025_test_suite.sql` em banco local descartável. Ela não usa pgTAP; portanto, não foi apresentada como suíte compatível com `supabase test db`.

O teste de concorrência cria seu próprio usuário temporário via SQL administrativo, alterna para a role `authenticated` e injeta o contexto da identidade nas duas conexões. Não exige copiar um token JWT; não testa login HTTP. Usa dados fictícios e remove apenas os registros do usuário que criou. Erros ou configuração ausente encerram com código de saída diferente de zero.

## Limites do pacote

- A RPC de importação usa `SECURITY DEFINER`: seu isolamento depende das validações explícitas, da identidade derivada e das referências resolvidas exclusivamente dentro do payload. As operações normais das tabelas usam RLS. Ela não aceita um proprietário arbitrário enviado pelo cliente.
- O advisory lock serializa importações que usam a mesma RPC. Ele não bloqueia automaticamente outras gravações do aplicativo; durante a integração, a interface deve impedir edição enquanto importa, ou os demais caminhos de gravação devem adotar coordenação compatível.
- A detecção/resolução de conflitos por `version` e o fluxo completo de sessão pertencem à etapa seguinte. A simples presença da coluna não implementa esses fluxos.
- Não foi possível comparar o modelo com todos os módulos originais nem abrir a interface. A compatibilidade final exige a pasta completa do projeto.
