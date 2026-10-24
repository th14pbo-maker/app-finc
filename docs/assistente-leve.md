# Assistente leve — voz e texto

Primeira etapa autorizada: preparar receitas/despesas por voz ou texto e responder a saldo, gastos mensais por categoria e projeção. Mantém o app estático, sem dependências, chaves ou modelo de IA. Comandos são limitados e explicados na interface; não é um chat de IA geral.

O botão Assistente abre um módulo sob demanda. Ouvir exige um segundo clique explícito. O navegador transcreve em pt-BR; pode enviar áudio ao serviço de reconhecimento e exigir internet. O app não grava áudio nem histórico de conversa. Sem suporte/permissão, texto continua disponível. Fechar, esconder a página ou navegar encerra a escuta.

Cada lançamento é um rascunho. A interpretação mostra valor, descrição, data, categoria sugerida e conta. Revisar abre o formulário existente; somente Salvar grava. Conta ambígua fica sem seleção. Frases com valores/datas ambíguos pedem reformulação. Transferências, parcelas e faturas usam o formulário manual nesta etapa.

Consultas calculam dados reais, respeitam o mês indicado e valores ocultos. Despesas incluem compras no cartão; pagamentos e transferências não são duplicados. Projeção reutiliza projectBalance, sem presumir rendimentos ou recorrência; simulação de gasto não salva.

Alternativas consideradas: modelo local exigiria download e processamento maiores; API externa exigiria backend, autenticação e custo. A etapa escolhida usa reconhecimento do navegador e regras locais. IA livre fica para uma etapa posterior.

Verificação: parser com números brasileiros e por extenso, datas, conta/categoria, recusas, consultas e imutabilidade; ciclo do microfone com eventos simulados; interface real e peso dos arquivos. Reconhecimento acústico real depende do dispositivo do usuário e precisa de teste nele.
