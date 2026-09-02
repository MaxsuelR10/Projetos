# Regras financeiras do sistema

## Metodologia

O dashboard usa **regime de caixa**. `Quanto entrou`, `Quanto saiu`, `Já pago` e `Resultado do mês` consideram a data de liquidação (`settledAt`) e somente lançamentos `COMPLETED`. Para registros legados sem liquidação, a data do lançamento é o fallback.

Orçamentos usam **competência de consumo**: despesas não canceladas e compras no cartão consomem o orçamento na data da compra/lançamento. O pagamento da fatura é excluído do orçamento para não duplicar o consumo.

## Invariantes

1. O saldo atual é dinheiro real. Só receitas recebidas, despesas pagas, transferências efetivadas e ajustes manuais o alteram.
2. Receita pode estar pendente, recebida (`COMPLETED`) ou cancelada. Apenas a recebida aumenta saldo e caixa mensal.
3. Despesa pendente ou atrasada aparece em `A pagar`, sem reduzir o saldo. A paga reduz a conta uma única vez.
4. Compra no crédito reduz limite e cria parcelas/faturas, mas não movimenta conta bancária.
5. Pagamento de fatura cria uma única despesa liquidada, debita a conta e marca fatura/parcelas como pagas na mesma transação de banco.
6. Parcelas são divididas em centavos; a soma das parcelas é sempre igual ao valor da compra. Diferenças de centavo ficam nas primeiras parcelas.
7. Recorrências são regras geradoras. A chave única `(recurringTransactionId, date)` impede duplicidade; `nextOccurrenceDate`, `occurrencesGenerated` e `lastGeneratedAt` controlam o ciclo.
8. Transferência entre contas próprias altera as duas contas na mesma transação, não entra em receita/despesa e preserva o patrimônio.
9. Resultado mensal de caixa = receitas liquidadas no período − despesas liquidadas no período.
10. `A pagar` inclui apenas despesas pendentes/atrasadas e parcelas de faturas ainda não pagas no período selecionado.
11. `Já pago` é a soma direta das despesas liquidadas no período; não é derivado por subtração.
12. Patrimônio é calculado separadamente: saldos de contas ativas e inativas + valor atual dos investimentos. Transferências não o alteram.

## Datas e valores

- Datas civis são persistidas em UTC, com exibição `pt-BR`.
- Liquidações usam a data escolhida pelo usuário.
- Recorrências mensais preservam o dia-base quando possível e usam o último dia do mês quando necessário.
- Valores financeiros usam `Decimal` no backend e no PostgreSQL. Conversão para `Number` é limitada à apresentação de percentuais no frontend.

## Auditoria

- Ajustes de saldo registram saldo anterior, novo saldo, diferença, conta, usuário e data.
- Pagamentos de fatura mantêm a transação de pagamento e `paidAt`.
- Cancelamentos financeiros preservam o registro com status `CANCELLED`; transferências usam estorno (`isReversed`).
