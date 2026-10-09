# Atualização 4 — Conciliação mensal assistida

Entregue e validada localmente em 09/10/2026.

## O que foi entregue

- Nova tela **Conciliação**, disponível na navegação e a partir da importação de extrato.
- Escolha de conta (inclusive inativa) e mês; comparação do saldo informado pelo banco com o fechamento calculado.
- Oito totais clicáveis: saldo de abertura, receitas, despesas, transferências recebidas/enviadas, faturas pagas, ajustes e saldo final.
- Composição com busca, indícios de duplicidade, detalhes e links para os movimentos da conta.
- Pendentes exibidos separadamente, sem efeito no fechamento.
- Registro de revisões com cópia dos movimentos e justificativa obrigatória quando houver diferença.
- Histórico preservado; alteração relevante sinaliza revisão desatualizada e permite uma nova conferência.

## Cálculo e limites

A base é o saldo inicial cadastrado mais o histórico registrado. Saldo atual não é usado como fechamento de meses anteriores.

Transações entram pela liquidação, não apenas pela competência. Datas sem horário mantêm o dia informado; timestamps usam America/Sao_Paulo. Transferências usam a data registrada; ajustes usam sua data de criação. Compras de cartão não debitam novamente a conta: só o pagamento da fatura entra.

Lançamentos antigos sem data de liquidação usam a data do lançamento com aviso e exigem justificativa para registrar a revisão. Saldo atual que não pode ser explicado pelo histórico bloqueia o registro; não se presume uma correção. Mês em aberto permite consulta, mas não registro de revisão.

Valores e diferenças são calculados com Decimal, até quatro casas, sem arredondamento intermediário. Duplicidades são indícios por data, tipo, valor e descrição normalizada; nunca são removidas automaticamente.

A revisão não paga, exclui, ajusta nem bloqueia lançamentos. Ela é anexada ao histórico. Reenvios da mesma solicitação são idempotentes; mudanças no histórico ou nos dados da conferência geram uma nova solicitação. Alterações normais de meses posteriores não invalidam o fechamento anterior.

## Proteções e validações

- Autenticação, isolamento por usuário e verificação de conta proprietária.
- Conferência consistente em transação de leitura; registro serializável com verificação da assinatura do histórico.
- Conta com revisão não pode ser excluída pelo fluxo de exclusão.
- 92 testes do backend aprovados, incluindo oito novos testes de integração.
- Frontend: lint e build aprovados.
- Chrome headless: saldos, filtros, possíveis duplicidades, detalhes, revisão, nova revisão com o mesmo saldo, histórico desatualizado, diferença justificada e links de retorno aprovados.
- Layouts de 1440 px e 390 px sem transbordamento horizontal, com capturas inspecionadas.

O teste prático usa usuário local temporário e remove somente seus próprios registros ao terminar. Nenhum registro financeiro real foi usado ou alterado.

## Operação local

Migração aplicada no banco local: `20261009190000_monthly_reconciliation`. Cliente Prisma gerado.

Para repetir o teste prático, executar a API local em localhost:3000 e o frontend em 127.0.0.1:5173 com `VITE_API_URL=/api`. Na pasta backend, executar `node scripts/smoke-reconciliation.mjs`. Chrome instalado é necessário; `CHROME_PATH` permite informar o executável.

Esta entrega não publica nem aplica migração em produção. Antes da publicação, fazer backup do banco de destino, aplicar a migração e usar o processo habitual de implantação.

## Próximo passo

[Atualização 5: mapeamento assistido de CSV e perfis por banco](next-update-csv-mapping.md).

