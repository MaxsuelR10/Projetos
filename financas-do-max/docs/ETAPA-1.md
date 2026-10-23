# Etapa 1 — base financeira, versão 1.1.0

Entregue localmente em 21/10/2026. Objetivo: aproximar a nova interface das regras já desenvolvidas no Controle de Finanças, antes de integrar banco e IA.

## Implementação

- Faturas pelo mês de vencimento; compra no dia do fechamento inicia o próximo ciclo. Fechamento limitado ao fim dos meses curtos.
- Divisão de compras em centavos; parcelas posteriores ocupam faturas sucessivas, inclusive na virada do ano.
- Visão da fatura lista a parcela daquela competência, e não o valor integral da compra.
- Limite comprometido inclui todo o saldo não pago das compras do cartão.
- Registro de pagamento debita uma única conta, preserva a composição paga e libera só as parcelas quitadas. Segundo pagamento e edição isolada de registros vinculados são bloqueados.
- Parcelamentos do cartão aparecem automaticamente em Parcelamentos e acompanham os registros de pagamento das faturas. Controles manuais antigos permanecem separados.
- Transações pendentes/canceladas não baixam saldo. A lista preserva cancelados para consulta e eventual edição.
- Caixa usa a data efetiva de liquidação. Consumo usa a data da compra e ignora o débito de fatura, evitando dupla contagem. Categorias e orçamentos mantêm a competência de consumo.
- Painel permite selecionar caixa, consumo ou uma fatura de cartão. Acrescentada a soma de despesas pendentes e faturas não pagas no mês.
- Backups existentes continuam aceitos sem sobrescrita automática. Cartões antigos sem fechamento exigem configuração explícita para permitir pagamento; nenhum dia é inferido.
- Backups com pagamentos e parcelas inconsistentes são rejeitados. CSV distingue pagamento de fatura e impede reimportá-lo como despesa comum.

## Validações

- `npm run check`: passou.
- `npm test`: 31 testes aprovados em dois arquivos.
- Comparação com `cardInstallmentCompetence` do aplicativo original: 7.080 combinações de datas, fechamento, vencimento e índice de parcela; zero divergências.
- Navegador em origem isolada `http://127.0.0.1:4174`: criado cartão de homologação, fechamento 3 e vencimento 23. Compra fictícia de R$ 100,01 em 02/10/2026, em três parcelas: outubro R$ 33,34; novembro R$ 33,34; dezembro R$ 33,33. Limite inicial de R$ 1.000,00 mostrou R$ 899,99 disponíveis.
- Registrado o pagamento da primeira parcela na origem de teste. Comprometido caiu de R$ 100,01 para R$ 66,67, disponível passou a R$ 933,33, e Parcelamentos apresentou 1/3 paga. O pagamento persistiu após recarregar e o controle de segundo pagamento ficou desativado.
- Despesa pendente fictícia de R$ 50,00 não alterou os saldos: R$ 10.647,66 e R$ 1.000,00 antes e depois. Caixa e consumo apresentaram valores distintos coerentes com a pendência e a fatura paga.
- Visão de uma fatura no painel e atalho para transações conferidos: mostraram somente a parcela de R$ 33,34. Filtro de pendências verificado após sair do recorte de fatura.
- Celular: viewport solicitado de 390 × 844, área útil e largura total do documento de 375 px; sem rolagem horizontal do documento. Layout dos cartões conferido.
- Console da aba de homologação: sem erros retornados na verificação.

Os testes de interface utilizaram exclusivamente a origem 4174 e dados fictícios. Os registros do usuário na origem 4173 foram preservados. O projeto original foi somente consultado; não houve acesso de escrita ao PostgreSQL/Neon, execução de migrations, alteração de produção, envio do código ou publicação.

## Continuidade

Esta etapa não conserta a integração Gemini antiga. O assistente atual continua local e assim é identificado. A evolução segue `ETAPAS.md`: operações completas, integração com a API/autenticação existente em homologação e diagnóstico da IA com resposta real validada. Estornos de pagamento, mudança de ciclo com histórico pago, conciliação de saldos e recorrências automáticas permanecem para etapas posteriores.
