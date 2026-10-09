# Próxima atualização — Regras inteligentes de categorização

Status: concluída em 09/10/2026. Entrega e verificação em [update-3-category-rules.md](update-3-category-rules.md).

## Por que este é o próximo passo

A importação agora é segura e conferível. O atrito que permanece é repetir a
mesma correção de categoria para estabelecimentos conhecidos em todo novo
extrato. A próxima versão deve transformar uma correção confirmada pelo usuário
em uma regra reutilizável, sem alterar lançamentos antigos automaticamente.

## Fluxo proposto

1. Durante a prévia, o usuário corrige a categoria de uma linha.
2. A tela oferece “Usar esta categoria nas próximas vezes”.
3. O usuário escolhe uma regra exata ou por trecho da descrição.
4. Novas prévias aplicam a regra e mostram claramente por que a categoria foi
   sugerida.
5. Uma tela simples permite ativar, pausar, editar e excluir regras.

## Regras essenciais

- Regras pertencem ao usuário e podem ser limitadas a uma conta.
- Correspondência exata tem prioridade sobre regra “contém”.
- Regras pessoais têm prioridade sobre sugestões genéricas do sistema.
- Conflitos ficam visíveis e nunca são resolvidos silenciosamente.
- A regra atua apenas em novas prévias; não recategoriza o histórico.
- A categoria precisa continuar ativa e ser compatível com receita/despesa.
- Toda sugestão informa sua origem: regra pessoal, heurística ou fallback.

## Critérios de aceite

- Corrigir “UBER *TRIP” para Transporte e salvar a regra categoriza a próxima
  ocorrência automaticamente.
- O usuário consegue limitar a regra à conta escolhida.
- Pausar a regra faz a próxima prévia voltar à sugestão padrão.
- Duas regras conflitantes geram aviso na gestão e não classificação arbitrária.
- Excluir ou desativar uma categoria deixa a regra inválida visível para ajuste.
- Nenhum lançamento já confirmado é modificado.
- O fluxo funciona em celular e desktop.

## Ordem de implementação

1. Modelo e API de regras, com prioridade e escopo por conta.
2. Aplicação das regras no serviço de prévia CSV.
3. Ação “usar nas próximas vezes” na linha revisada.
4. Gestão de regras nas configurações.
5. Testes de conflito, categoria inativa, escopo e responsividade.

## Depois desta versão

O passo seguinte é uma conciliação mensal: comparar saldo informado pelo banco
com o saldo calculado, explicar divergências e permitir fechar o período.
