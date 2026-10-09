# Atualização 3 — Regras inteligentes de categorização

Concluída em 09/10/2026, complementando o trabalho salvo em 243e991.

## Entrega

- Regras pessoais por descrição exata ou por trecho, globais ou limitadas a uma conta.
- Prioridade: exata, escopo da conta, prioridade informada e comprimento do padrão.
- Aprendizado opcional na correção da categoria de uma linha da prévia CSV.
- Regra e lançamento salvos na mesma transação, com proteção contra reenvio.
- Sugestão identifica regra pessoal, sugestão automática ou categoria padrão.
- Regras empatadas com categorias diferentes geram conflito e exigem revisão explícita na interface.
- Gestão em /regras-categorias: criar, editar, ativar, pausar e excluir.
- Regras com categoria/conta inativa ficam visíveis para ajuste e podem ser pausadas.
- Lançamentos antigos não são recategorizados.

## Verificação

- Migração 20261008150000_category_rules aplicada ao PostgreSQL local.
- 84 testes de backend aprovados, incluindo 7 cenários de regras.
- Lint e build da interface aprovados.
- Teste no Chrome com usuário isolado: criação, pausa, ativação, edição, aprendizado, reutilização e conflitos.
- Capturas e verificação de ausência de transbordamento em 1440px e 390px.
- Usuários e registros criados pelos testes removidos ao final.

Teste prático reproduzível: frontend local em 127.0.0.1:5173 com VITE_API_URL=/api,
e executar node scripts/smoke-category-rules.mjs dentro de backend.
O teste exige Chrome instalado, porta 3000 livre e banco local.

## Próxima atualização

Conciliação mensal assistida. Escopo e critérios preparados em
[next-update-monthly-reconciliation.md](next-update-monthly-reconciliation.md).
