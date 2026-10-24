# Projeção de saldo

O painel “Seu saldo no futuro” usa o mês selecionado e permite horizontes de 3, 6 e 12 meses (padrão: 12). É um cenário baseado no cadastro, sem extrapolação estatística, recorrência automática, inflação ou rentabilidade.

A base soma os saldos iniciais das contas e as entradas, despesas e pagamentos de cartão anteriores ao primeiro mês. Transferências internas e aportes informativos em metas não alteram o total das contas.

Cada entrada e despesa futura ocorre uma vez, na data cadastrada. Para cartões, o fechamento define a fatura e seu vencimento. Pagamentos anteriores ao início do período já estão na base. Os pagamentos previstos são reservados na data do pagamento ou no vencimento, o que vier antes; o restante da fatura é reservado no vencimento. Pendências vencidas são reservadas no primeiro mês da projeção. Não há dupla contagem de compra e pagamento. A previsão pressupõe quitação até o vencimento e não calcula multas/juros.

O gráfico mostra saldo no fim de cada mês: segmento verde para aumento, vermelho para redução e cinza para estabilidade. Saldo negativo gera aviso. O indicador por transação atribui efeito positivo à receita, negativo à despesa/compra e neutro à transferência/pagamento já considerado. Não julga a utilidade ou prioridade da despesa. Registros anteriores ao período já estão incluídos na base, e valores fora do horizonte ainda não aparecem na curva.

A edição de um lançamento atualiza a projeção pelo mesmo identificador. O modo de privacidade oculta os valores e a curva. Nenhum novo dado é gravado para gerar a projeção, e backups existentes permanecem compatíveis.

Validação: `npm test` cobre centavos, histórico, horizontes, saldo negativo, cartões, pagamentos parciais/antecipados/tardios, pendências vencidas, transferências e correção de valores.
