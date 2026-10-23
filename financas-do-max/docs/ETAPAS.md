# Evolução do Controle de Finanças

Objetivo confirmado pelo usuário: evoluir o aplicativo existente com a nova interface, preservando funcionalidades e dados. A implementação local é um ambiente separado; o backend original e o banco de produção permanecem intactos.

1. **Base financeira — entregue localmente (v1.1.0):** fechamento exclusivo de faturas, vencimento, parcelas em centavos, limite comprometido, registro de pagamento sem duplicação, situação de transações e separação entre caixa e consumo. Ver `ETAPA-1.md`.
2. **Operações completas — em andamento:** prévia CSV com seleção, duplicatas e saldo entregue na v1.2.0; recorrências, calendário de assinaturas, liquidação/cancelamento/restauração e histórico local entregues na v1.3.0. Ver `ETAPA-2-PREVIA.md` e `ETAPA-2-RECORRENCIAS.md`. Faltam mapeamento livre de colunas/conciliação e ampliar os testes de ponta a ponta. Isso não equivale ao produto Pierre inteiro.
3. **Integração futura com Neon e aplicativo existente:** migrar os módulos para o repositório próprio somente na etapa autorizada; definir API, autenticação e persistência por usuário em PostgreSQL/Neon isolado para testes. Confirmar esquema, backup e migração antes de qualquer alteração no banco real. Não executar o comando antigo que implanta migrações automaticamente em produção.
4. **IA real com Gemini:** diagnosticar a integração anterior sem expor segredos, criar rota no backend próprio, manter a chave fora do navegador e validar resposta real, autenticação, quotas e erros. Começar com dados fictícios e ferramentas somente de leitura; alterações financeiras exigirão confirmação. O chat por regras atual não comprova que a IA funciona.
5. **Entrega:** revisão visual e acessibilidade de ponta a ponta, testes móveis, teste com usuário de homologação e publicação no destino autorizado.

Fonte das regras da etapa 1: `docs/financial-business-rules.md`, `docs/update-5-csv-mapping-and-invoice-cycle.md` e `backend/src/utils/financial-competence.js` do projeto local `C:/Users/Maxsuel/controle-de-finanças`. Esse projeto foi apenas consultado.
