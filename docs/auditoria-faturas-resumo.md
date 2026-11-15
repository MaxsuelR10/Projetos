# Auditoria de faturas e do Resumo Financeiro

## Diagnóstico

- Na versão React/Express, `getDashboard` consultava faturas por vencimento com `take: 1`. O endpoint entregava apenas `nextInvoice`, e a tela exibia o detalhe de fatura somente depois da seleção de um cartão. Em novembro, o Inter vencia dia 12 e o Nubank dia 20. Ao executar as duas versões da consulta sobre o mesmo PostgreSQL sintético, a original entregou somente o Inter, e a corrigida listou Inter e Nubank. As duas faturas já estavam atribuídas à competência correta.
- No aplicativo de `financas-do-max`, `summaryFor` somava o valor integral de todas as faturas do mês, inclusive as pagas. O estado aceitava apenas um pagamento por fatura. O navegador também atualizava o resumo antes de o servidor confirmar o salvamento, o que podia mostrar quitação local mesmo após um conflito de revisão.
- No backend relacional, o vínculo único entre fatura e pagamento impedia parcelas de pagamento. A atualização genérica de transações também podia editar um débito vinculado sem recalcular a fatura. O histórico e os relatórios já tinham vínculos separados com as compras. A correção usa esses vínculos.

## Implementação

| Fluxo | Regra |
| --- | --- |
| Resumo | Lista todo cartão com saldo positivo e vencimento no intervalo. Mostra atrasos anteriores em seção própria, com total próprio. A fatura vence no dia de calendário indicado e passa a atrasada no dia seguinte. |
| Competência de cartão | Usa o ciclo do cartão e o mês do vencimento da parcela. Compras feitas no dia do fechamento entram no próximo ciclo. Dias que excedem o mês são limitados ao último dia civil. Uma compra de R$ 600 em 3 parcelas em 22/10/2026 no Nubank de fechamento 16 e vencimento 20 entra em novembro, dezembro e janeiro, R$ 200 por mês. |
| Pagamento | O pagamento altera o caixa na data registrada e reduz somente o saldo pendente da fatura. A quitação remove a fatura do resumo e mantém a fatura, as compras e os pagamentos no histórico. Pagamentos parciais permitem novos lançamentos no mesmo ciclo. |
| Histórico | Exibe cartão, competência, vencimento, total, valor pago, saldo, situação, compras e pagamentos individuais. A edição ajusta a diferença na conta original ou transfere o efeito para a conta escolhida. O cancelamento devolve o valor à conta, mantém o registro cancelado e reabre a fatura quando houver saldo. |
| Categorias e caixa | Compras no cartão entram por competência da parcela, independentemente da quitação. O pagamento aparece no caixa na data efetiva e fica fora das despesas de consumo. No gráfico React, as demais despesas entram por liquidação. No resumo de `financas-do-max`, despesas fora do cartão entram pela data do lançamento, com corte até hoje no mês corrente. |
| Indicadores | O saldo de contas reflete o caixa atual. O limite usado e os compromissos de fatura usam o saldo em aberto. O histórico mensal geral do React usa caixa. Com cartão selecionado, o gráfico de compras usa competência e o indicador de pagamentos usa liquidação. |

### API e persistência

- `GET /api/dashboard` passou a retornar `pendingInvoices` e `overdueInvoices`. `summary.invoiceTotal` soma o primeiro grupo e `summary.overdueInvoiceTotal` soma o segundo. `nextInvoice` continua disponível para clientes que usam o campo unitário. O cartão inativo pode continuar com obrigações em aberto.
- `GET /api/cards/:id/invoices?status=all` retorna os campos `totalAmount`, `paidAmount`, `remainingAmount`, `effectiveStatus`, `paidAt`, `payments` e as parcelas vinculadas. A tabela relacional usa `PAID` como estado de quitação e calcula o atraso na leitura.
- `POST /api/invoices/:id/pay` mantém a quitação do saldo sem informar `amount`. Para enviar valor explícito, o cliente inclui `paymentId`, uma chave única da tentativa. `PATCH` e `DELETE /api/invoices/:id/payments/:paymentId` atualizam ou cancelam um pagamento da própria fatura. O bloqueio da linha da fatura e uma única transação PostgreSQL protegem a escrita concorrente, incluindo a movimentação de saldo.
- A migração relacional adiciona `paidAmount` e substitui o índice único de pagamentos por um índice de consulta para aceitar vários pagamentos por fatura. Preserva as chaves estrangeiras e os registros existentes. Uma fatura legada com status `PAID` continua quitada e pode ter o pagamento corrigido pelo mesmo fluxo.
- Na versão com Neon, o débito e o histórico são salvos no mesmo documento via `PUT /api/state`. A revisão esperada é conferida na atualização SQL. O navegador atualiza a tela depois da confirmação. Backups legados com um pagamento integral e cartões sem fechamento continuam legíveis.

## Reconciliação sintética

| Evento em novembro de 2026 | Nubank pendente | Inter pendente | Total a pagar | Combustível |
| --- | ---: | ---: | ---: | ---: |
| Compras em 22/10 | R$ 150 | R$ 100 | R$ 250 | R$ 250 |
| Pagamento parcial de R$ 60 no Nubank | R$ 90 | R$ 100 | R$ 190 | R$ 250 |
| Quitação do Nubank | R$ 0 | R$ 100 | R$ 100 | R$ 250 |
| Quitação das duas faturas | R$ 0 | R$ 0 | R$ 0 | R$ 250 |

A integração também validou as compras de 26/10, com R$ 280 em Alimentação, e as três parcelas de R$ 200. Incluindo essas compras, o total inicial de novembro foi R$ 730. Um atraso de R$ 50 entrou apenas no total de atrasos anteriores. A repetição concorrente de um pagamento parcial debitou a conta uma vez. A edição para outra conta e outro mês alterou o caixa correspondente e preservou os totais por categoria.

## Verificação e limites

- Vitest registrou 113 testes aprovados em 28 arquivos contra um PostgreSQL 18 local dedicado. A suíte Node de `financas-do-max` registrou 148 testes aprovados. Build Vite, ESLint, validação Prisma e verificações de sintaxe da versão em JavaScript passaram. As suítes também cobrem fechamento, fevereiro, virada de ano, cartões sem despesa, alterações e cancelamentos de compras, importação, recorrências e transferências.
- O Edge verificou o fluxo Resumo → fatura → compras e pagamentos → Resumo. A versão React usou a API Express e o PostgreSQL local para testar também a edição e o cancelamento do pagamento. A versão com Neon usou a API HTTP da aplicação com armazenamento de teste em memória e confirmou a rejeição de gravação concorrente com revisão antiga.
- A fatura que já recebeu pagamento mantém a composição histórica protegida. A versão relacional permite revisar ciclos de faturas em aberto sem pagamentos, preservando as quitadas. A versão em JSON conserva a proteção de ciclo e conta do cartão enquanto houver pagamentos ativos. Compras canceladas antes de pagamento deixam de compor a fatura. Um estorno bancário independente, como crédito de devolução emitido pela operadora após a quitação, ainda não tem fluxo próprio.
- A comparação Prisma entre o banco criado pelas migrações e o schema mostrou divergências anteriores em `PaymentReminder`, `RecurringTransaction` e `WishItem`. Os modelos de faturas e pagamentos coincidiram.
- A publicação, o banco remoto e os registros financeiros reais ficaram fora da execução. A confirmação da fatura específica do usuário depende de conferir, em leitura, o cartão vinculado, a data original, o fechamento cadastrado, a competência gravada e o eventual pagamento da fatura.
