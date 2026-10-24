# Assistente leve — plano de implementação

> **For agentic workers:** Use superpowers:executing-plans para executar as etapas.

**Goal:** lançar por voz/texto com revisão e consultar os dados sem tornar o carregamento pesado.
**Architecture:** módulos nativos carregados ao abrir o assistente; parser puro e cálculos existentes, adapter de SpeechRecognition, diálogo acessível.
**Tech Stack:** JavaScript nativo, CSS, node:test; zero dependências novas.
**Spec:** ../../assistente-leve.md

## Restrições e foco de revisão

- Preservar edições anteriores; trabalhar na branch feat/assistente-leve.
- Não salvar automaticamente; não enviar dados financeiros a um modelo externo.
- Recusar múltiplos valores, datas desconhecidas, comandos de fatura/transferência e filtros não suportados.
- Respeitar valores ocultos, conta não informada, encerramento do microfone e texto em navegador incompatível.
- Publicar na prévia existente; GitHub/Vercel continuam sem push.

## Etapa 1: interpretação e consultas

- [x] Criar tests/assistant.test.mjs: valores 35,50 e trinta e cinco reais; receita; ontem; sem conta ambígua; projeção/consultas sem mutação; recusas explícitas.
- [x] Executar node --test tests/assistant.test.mjs e observar falha antes da implementação.
- [x] Criar app/js/assistant.mjs, interpretAssistant(text,state,{day,month}), retornando draft, answer ou help; sem escrita.
- [x] Executar npm test; todas as verificações devem passar.

## Etapa 2: voz e interface

- [x] Testar adapter createVoiceSession em tests/speech.test.mjs: start explícito, final/parcial, stop, erro e dispose sem callbacks tardios.
- [x] Criar app/js/speech.mjs e app/js/views/assistant.mjs. Diálogo com texto, exemplos, status, microfone e revisão pelo formulário existente.
- [x] Integrar import dinâmico em app.mjs, ícone mic em ui.mjs e CSS sob demanda; manter conta vazia no formulário de rascunho.
- [x] Atualizar versão do SW, sem pré-carregar módulos do assistente; offline após primeiro uso pelo cache existente.
- [x] Executar suíte e verificar UI no navegador, sem salvar dados de teste no perfil real.

## Etapa 3: entrega

- [x] Revisar diffs, medir arquivos e verificar syntax/testes.
- [x] Revisão independente da mudança e correção de problemas importantes encontrados.
- [x] Publicar fontes verificadas na mesma prévia e renovar ZIP do projeto para salvar.

## Registro

Baseline: 13 testes aprovados. Implementação no checkout atual preserva alterações ainda não commitadas; branch nova evita editar main. Não criar commits GitHub sem identidade/configuração; o fluxo Sites gerencia seus próprios commits. A autorização para a primeira etapa e publicação da prévia já existe na conversa.

Verificação final: 26 testes aprovados, syntax e diff sem erros. Revisão independente corrigida: amanhã, expressões de data não suportadas, segundo valor por extenso, multiplicadores e valor escondido na categoria. Centenas por extenso aceitas; exemplos desabilitados durante a escuta. Interface publicada testada com rascunho de R$ 35,50 para amanhã, revisão/cancelamento e consultas reais de gastos e projeção. Nenhum dado financeiro de teste salvo. Reconhecimento acústico real não testado neste ambiente; requer o dispositivo do usuário. Módulos opcionais: 24.023 bytes, cerca de 9.779 bytes em gzip, sem dependências. Publicação Sites v11, commit 22c14e1590a98a1f27cd5af73953b9a825eb75f6. GitHub/Vercel continuam sem commit/push.
