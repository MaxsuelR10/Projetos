# Próxima atualização — Conciliação mensal assistida

Status: concluída em 09/10/2026 como atualização 4. Veja [a entrega e as validações](update-4-monthly-reconciliation.md).

Próxima etapa sugerida: [mapeamento assistido de CSV e perfis por banco](next-update-csv-mapping.md).

## Objetivo

Comparar o saldo final informado pelo banco com o saldo calculado pelo sistema
por conta e mês, ajudar a localizar divergências e registrar a revisão do período.

## Fluxo

1. Selecionar conta e mês.
2. Mostrar saldo inicial, entradas, saídas, ajustes de saldo e saldo final calculado.
3. Informar saldo final do extrato; mostrar a diferença com sinal e valor.
4. Abrir os lançamentos que compõem cada total, procurar faltantes e possíveis duplicidades.
5. Registrar o período como revisado apenas com diferença zero ou justificativa explícita.
6. Mostrar se alterações posteriores tornam a conciliação desatualizada e permitir revisar novamente.

## Regras de cálculo e proteção

- Contar movimentos liquidados na conta, transferências e pagamentos de fatura.
- Compras de cartão só impactam o saldo da conta no pagamento da fatura.
- Tratar ajustes de saldo explicitamente para não contar a mesma correção duas vezes.
- Definir competência da liquidação e data de corte antes de calcular saldos históricos.
- Não usar o saldo atual como saldo final de meses anteriores.
- Não criar ajustes nem excluir lançamentos automaticamente para zerar a diferença.
- Revisão é um registro auditável, sem bloquear a edição do histórico nesta primeira versão.
- Cada conciliação pertence ao usuário; contas inativas continuam disponíveis para consulta.

## Ordem sugerida

1. Auditar eventos que alteram saldo e reconstrução histórica, incluindo transferências e cartões.
2. Criar cálculo por período e testes dos casos financeiros.
3. Criar prévia de conciliação com detalhamento e comparação com o extrato.
4. Salvar revisão, justificativa e estado desatualizado após mudança relevante.
5. Validar celular e desktop com dados isolados.

## Critérios de aceite

- Conta com entradas, saídas, transferências, ajustes e pagamento de cartão fecha corretamente.
- Diferença positiva/negativa aparece com explicação clara e acesso aos movimentos.
- Reenvio não duplica a revisão.
- Alterar um movimento de período revisado sinaliza necessidade de nova revisão.
- Nenhuma correção financeira acontece sem ação explícita do usuário.
- Isolamento por usuário e ausência de alterações em registros reais durante a validação.
