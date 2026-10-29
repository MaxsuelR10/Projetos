# Agente financeiro do Max — implementação preparada para produção, 28/10/2026

## Situação da entrega

Implementação integrada localmente no checkout correto de `MaxsuelR10/Projetos`, na pasta `financas-do-max`, branch `codex/financas-max-neon-auth`. Nenhum arquivo `.env.local` ou segredo foi copiado para o checkout. O schema auxiliar foi criado no Neon em 28/10/2026; nenhuma operação financeira foi gravada. O Git ainda não foi enviado por SSH e ainda não houve novo deploy na Vercel.

## Auditoria e arquitetura encontrada

- Frontend: módulos JavaScript, HTML e CSS em `dist/`; sem React, build de TS ou Yarn.
- Backend: servidor HTTP nativo de Node.js em `server.mjs`; adaptador Vercel em `api/index.mjs`; roteamento em `http-api.mjs`. Não há Express.
- npm, com `package-lock.json`; Node >=22.
- Persistência existente: `storage.mjs`, driver Neon HTTP, uma linha JSONB por usuário na tabela `financas_max_state`. Controle otimista de concorrência por `revision`.
- Não existia schema Prisma. Os relacionamentos de conta/categoria/cartão/transação ficam no JSONB e são validados por `validateState`, `billing.mjs`, `recurrences.mjs` e `financial-operations.mjs`.
- Autenticação: Neon Auth; cookie HttpOnly criptografado, sessão revalidada no provedor. O workspace é derivado da sessão (`user:<id>`), não do corpo da requisição.
- Contas, categorias, transações e dashboard: `dist/domain.mjs` e `dist/app.mjs`. Faturas e parcelamentos: `dist/billing.mjs`. Recorrências e assinaturas: módulos próprios de domínio e interface. Histórico: `dist/audit.mjs`.
- Agentes anteriores: regras locais de orçamento, duplicidades e resumo; preservadas.
- Gemini existente: `max-ai.mjs`, `@ai-sdk/google` e AI SDK; `/api/chat` e `/api/chat/status`. A tela atual é `dist/ui-max-chat.mjs`. A integração anterior responde consultas e continua disponível.
- Não existiam `/api/assistant/chat` ou `/api/assistant/conversations/latest`.

## Implementação

O modo **Agente financeiro** foi acrescentado à mesma tela do Max. Fluxo:

1. O navegador sincroniza as alterações locais e envia comando, mês, revisão e chave de idempotência.
2. Gemini interpreta usando `generateText` e `Output.object` com schema Zod estrito. Recebe somente comando e data civil de referência; não recebe extrato, saldo, lista de transações ou credenciais. O modelo configurado anteriormente foi preservado.
3. Se o provedor estiver desabilitado, sem chave, falhar ou devolver intenção inválida, o interpretador determinístico em Node.js tenta reconhecer o comando.
4. O backend resolve nomes exclusivamente nos dados do usuário autenticado, exige valores positivos em centavos inteiros e aplica as validações financeiras existentes. Ambiguidade ou falta de informação produz formulário de esclarecimento.
5. Uma prévia validada fica no banco com token aleatório de 256 bits, hash, proprietário, revisão e expiração de cinco minutos. A criação da prévia não altera as finanças.
6. Confirmar usa transação Prisma: confere usuário, status, prazo e revisão; consome a operação; grava o JSONB com comparação da revisão; armazena o resultado. Qualquer falha desfaz toda a transação. Repetir uma confirmação concluída devolve o resultado sem lançar novamente.
7. O navegador adota a revisão e o estado persistidos. As telas, gráficos e saldos usam esse mesmo estado. Há botão para abrir a transação real retornada pelo backend.

O Prisma 7.10.1 com adaptador PostgreSQL foi adicionado para o caminho do agente. O armazenamento normal da aplicação permanece no driver existente. Ambos respeitam a mesma revisão; não foi feita uma conversão de todos os registros para tabelas normalizadas. O mapa de `financas_max_state` foi comparado com o DDL real do Neon antes da migração aditiva.

Ferramentas: criação, atualização, cancelamento, listagem de transações, resumo mensal, saldo por conta, despesas por categoria, contas, categorias, cartões e compra parcelada. As rotas não expõem execução arbitrária de ferramentas por nome.

Exclusão significa **cancelar e preservar o histórico**, seguindo o comportamento financeiro atual. Faturas pagas, pagamentos de fatura, transferências e registros vinculados a recorrências/assinaturas continuam protegidos no agente.

## Fallback e interface

Reconhece os verbos abasteci, gastei, paguei, lança/lance, recebi, ganhei e comprei; valores decimais e “2 mil”; hoje/ontem e datas ISO; consultas, edição por descrição e cancelamento da última despesa criada pelo assistente. Categoria vem de nome existente, palavras-chave e equivalências comuns; se não houver correspondência segura, solicita escolha.

No modo local simples anterior, nada é enviado ao provedor. No modo Agente, a interpretação tenta Gemini primeiro. O modo Gemini de orientação anterior mantém sua política de resumo financeiro. A interface distingue esses modos e explica a transmissão relevante.

Prévia com Confirmar/Editar/Cancelar, máscaras monetárias no formulário, indicador de processamento, mensagens de falha, revisão obrigatória após edição e layout mobile. Ditado opcional usa SpeechRecognition quando disponível; preenche o campo e nunca envia automaticamente. Não há garantia de funcionamento offline ou de compatibilidade universal do ditado.

## Endpoints

| Método | Caminho | Finalidade |
| --- | --- | --- |
| POST | `/api/assistant/chat` | Interpretar/consultar/preparar prévia |
| POST | `/api/assistant/confirm` | Confirmar token da sessão autenticada |
| POST | `/api/assistant/cancel` | Invalidar operação pendente |
| GET | `/api/assistant/conversations/latest` | Ler mensagens existentes do próprio usuário |
| GET/POST | `/api/chat/status`, `/api/chat` | Integração anterior preservada |
| GET/PUT | `/api/state` | Sincronização anterior preservada |

## Arquivos novos e alterados

Novos: `assistant-intents.mjs`, `assistant-tools.mjs`, `assistant-service.mjs`, `assistant-repository.mjs`, `prisma/schema.prisma`, `prisma/assistant-additive.sql`, `prisma.config.ts`, `dist/ui-assistant-actions.mjs`, `dist/assistant-actions.css`, `scripts/assistant-sandbox.mjs`, `tests/assistant-agent.test.mjs`, `tests/assistant-ui.test.mjs`, `tests/helpers/prisma-memory.mjs` e este relatório. Evidência visual: `docs/assistant-mobile.png`.

Alterados: `http-api.mjs`, `dist/ui-max-chat.mjs`, `dist/app.mjs`, `dist/remote-storage.mjs`, `dist/index.html`, `package.json` e `package-lock.json`.

## Migração aditiva do Neon

`prisma/assistant-additive.sql` cria somente `financas_max_assistant_operations` e seus índices. Foi aplicada em 28/10/2026 no projeto Neon `App Finacças`, branch `production`. A conferência posterior encontrou as colunas, restrições e índices esperados e zero operações na tabela. Nenhuma linha de finanças foi criada, alterada ou apagada. A tabela nova não tem acesso pelo frontend.

Não execute `prisma db push`, `migrate reset` ou uma migração de recriação do schema. O SQL é idempotente (`IF NOT EXISTS`); a CLI lê `DATABASE_URL_UNPOOLED`, se definida, e o runtime usa `DATABASE_URL`.

## Resultados de testes

122 testes automatizados passaram no checkout integrado: 107 anteriores e 15 novos. Incluem as 16 situações pedidas: despesa, receita, categoria, conta, datas relativas, informação ausente, parcelamento, saldo, mês, edição, cancelamento confirmado, falha do Gemini, fallback, duplicação, outro usuário e atualização dos cálculos do dashboard. Também verificam expiração, adulteração, solicitação repetida, rollback quando a persistência falha, revisão antiga, sessão/origem e atualização da revisão no navegador.

Testes de persistência usam um cliente Prisma em memória com transações serializadas e rollback. Testes de Gemini usam respostas/falhas simuladas. Esses testes não substituem a validação da concorrência no PostgreSQL real.

Navegador: lançamento de R$30 com categoria Transporte e conta Principal confirmado no sandbox; dashboard mostrou saída de R$30 e saldo R$2.370 a partir de R$2.400. Em largura mobile de 390px, lançamento de internet de R$80 foi interpretado como ontem, editado, revalidado e confirmado; o botão Ver lançamento apareceu. O sandbox não enviou esses lançamentos ao Neon.

Cliente Prisma 7.10.1 gerado com sucesso; `prisma validate`, `npm test` (122/122) e verificações de sintaxe passaram. O audit da instalação reportou zero vulnerabilidades; uma nova consulta ao registry npm não respondeu neste checkout.

## Como testar agora sem banco

```powershell
Set-Location 'C:\Users\Maxsuel\OneDrive\Imagens\ProjetoBia\Finanças do max\assistant-agent-work'
npm run dev:assistant
```

Abra `http://127.0.0.1:4180/#/chat`, ative **Registrar ou gerenciar por mensagem** e use os exemplos. O servidor usa autenticação fictícia somente em localhost, dados em memória, sem ler `.env.local` nem chamar serviços externos. Reiniciar limpa o sandbox; os rótulos antigos de sincronização do app não significam uma conexão real ao Neon nesse modo.

Para repetir a suíte: `npm test`. Para validação estática: `npm run check` e `npm run check:server`. Para regenerar cliente: `npm run prisma:generate`.

## Limitações e checklist antes de publicar

- Fazer teste end-to-end Prisma/PostgreSQL em ambiente de teste com sessões de dois usuários; a validação atual de DB foi somente leitura após a migração.
- Testar uma chamada real ao Gemini com chave do ambiente de desenvolvimento e confirmar disponibilidade/quota do modelo já configurado. Não houve chamada real ao provedor nesta entrega.
- Testar simultaneidade entre instâncias contra PostgreSQL; a proteção é transacional, mas o mock cobre somente a lógica.
- A limitação de 20 interpretações por minuto por usuário é por processo; em múltiplas instâncias, complementar com limite compartilhado/plataforma.
- Definir limpeza periódica das operações antigas após a retenção escolhida; não foi criado cron nem apagado histórico automaticamente.
- As mensagens usam o histórico do Max já salvo. Prévia pendente não é restaurada ao recarregar; o token expira. Confirmação concluída é repetível sem duplicar enquanto o registro de operação for retido.
- Comandos vagos, categorias/contas homônimas ou linguagem fora das regras locais exigem esclarecimento. Parcelamento precisa de cartão existente. O fallback não é um modelo de linguagem completo.
- O campo de salário e o nome do carro não criam conta/categoria automaticamente. “Classic” permanece na descrição; nunca é tratado como conta inexistente.
- Ditado depende do navegador e não foi testado com microfone real.
- Enviar a branch por SSH, atualizar `main` e confirmar que a Vercel concluiu o build de produção. O deploy atual ainda aponta ao commit `9e381944d592664482adb4d37d9b2619363aadd9`, anterior às alterações do agente.
- Depois do deploy, validar autenticação, consulta, prévia, cancelamento e confirmação com a conta do usuário; Gemini real e persistência operacional ainda não foram testados end-to-end.

Referência para o adaptador usado: [documentação Prisma 7](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers). O uso de saída estruturada foi conferido nos documentos e fontes da versão instalada do AI SDK.
