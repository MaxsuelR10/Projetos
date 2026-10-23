# Etapa 2 — Recorrências, assinaturas e operações locais

Versão 1.3.0, verificada em 22/10/2026. Aplicação independente, local, sem publicação, Gemini ou Neon conectados. O aplicativo antigo e seu banco não foram modificados.

## Entregue

- Regras de receita/despesa diárias, semanais, mensais e anuais, com intervalo, limite de ocorrências e data final. Pausa/retomada preservam registros; encerramento acontece pelo limite ou data final. Não há exclusão destrutiva de regras.
- Prévia sem gravação, confirmação explícita e rechecagem dos dados antes de gerar. Limite de 1.000 ocorrências por lote e somente até hoje. Nenhuma execução automática em segundo plano.
- Datas civis preservam a âncora original: 31/01 → 28/02 → 31/03; 29/02 retorna em ano bissexto. Intervalos e mudanças de ano são testados.
- Geração em conta cria pendências, sem alterar saldo; geração no cartão cria compras de uma parcela, sem débito em conta. Faturas já pagas impedem o lote inteiro antes de qualquer alteração.
- Identidade única por regra/data, inclusive para ocorrências canceladas. Coincidência exata com um lançamento manual não cancelado é ignorada e conta como processada. Duas regras distintas não são fundidas automaticamente.
- Registro explícito de pagamento/recebimento, cancelamento e restauração. O lançamento é preservado; contas restauradas voltam como pendentes. Cancelamento de transferência reverte os dois saldos no controle. Isso não executa nem desfaz operações no banco.
- Identificação de uma despesa como assinatura, nova ou existente, sem criar outra despesa. Programar uma assinatura é uma ação separada que cria uma regra vinculada.
- Calendário com dia, semana e mês, início na segunda-feira e previsões separadas de registros pendentes, concluídos e cancelados. Semanas atravessam meses; previsões não afetam saldo. Não se inventa histórico anterior à próxima data informada.
- Histórico local de mudanças com antes/depois: últimas 300 operações, até 50 mudanças detalhadas por evento, textos até 240 caracteres e contadores de truncamento. Não é imutável nem retroativo; mensagens de chat e segredos não são capturados por esse mecanismo.
- Novos campos opcionais preservam backups antigos. A gravação continua sendo feita em estado clonado, validado, e persistido antes de atualizar a interface.

## Como experimentar

1. Em Vision → Recorrências, crie uma regra. Salvar não gera lançamentos.
2. Use Revisar lançamentos → Ver prévia. Confira datas, conta, valores e duplicidades; só então confirme o lote.
3. Abra Ver lançamentos. Em uma pendência de conta, use Liquidar e informe a data efetiva. Cancelar e restaurar preservam o registro.
4. Em Assinaturas, selecione um dia e alterne Dia/Semana/Mês. Programar lançamentos vincula o serviço a uma regra; pausar em qualquer uma das telas mantém os estados sincronizados.
5. Consulte Histórico local em Recorrências ou Configurações. Exporte um backup antes de alterar navegador/endereço.

Retomar uma regra mantém sua próxima ocorrência não processada: a revisão poderá incluir atrasos do período de pausa. Se a obrigação deixou de existir, mantenha pausada ou defina seu término. Alterações de valor/conta/categoria valem para ocorrências futuras, sem reescrever as já geradas. O calendário inicial fica protegido após o primeiro processamento; regras concluídas exigem nova programação para continuar.

## Verificação

`npm run check` e `npm test`: 86 testes aprovados. Os novos testes abrangem regras, idempotência, duplicatas, geração atômica, assinaturas, calendário e sua navegação, auditoria, operações financeiras e round-trip do estado completo por JSON, inclusive formato legado.

Homologação manual em origem isolada `127.0.0.1:4174`, com dados fictícios, sem gravar na origem de uso `4173`:

- Regra de R$ 123,45 com início em 31/01/2026 e três ocorrências: prévia de 31/01, 28/02 e 31/03; antes da confirmação havia zero lançamentos gerados. Depois, três pendências e regra concluída.
- Saldo Banco Aurora antes da geração: R$ 10.601,99; permaneceu igual após gerar. Liquidar uma ocorrência em 22/10 levou o saldo a R$ 10.478,54. Cancelar voltou a R$ 10.601,99; restaurar deixou pendente, sem novo débito.
- Identificar a despesa como assinatura não mudou o saldo. O novo serviço persistiu após recarregar e apareceu como previsão em 31/10.
- Programação da assinatura Música+ não criou débito; pausar/retomar sincronizou assinatura e recorrência. Nova revisão até 22/10 mostrou zero ocorrências, sem repetir as três já processadas nem antecipar a cobrança de 25/10.
- Histórico apresentou as operações e detalhe antes/depois. Persistência após recarga conferida. Console de erros conferido ao final.
- Tela móvel de 390 × 844 solicitados: área útil e largura do documento de 375 px, sem overflow horizontal da página. A navegação de abas usa rolagem própria. Grade reduz a informação visual; detalhes e rótulos acessíveis mantêm o valor completo.

Capturas de homologação ficam em `../../apk-audit/generated/recorrencias-desktop.png` e `calendario-mobile.png`. Não fazem parte do pacote de código distribuído.

## Evidência e limites de equivalência

O exame estático do APK fornecido apoiou a decisão de oferecer calendário em pt-BR com segunda-feira e modos dia/semana/mês. O handler de adicionar assinatura observado marca `isSubscription: true` em uma transação, sem provar geração automática de cobranças. Por isso as duas ações são separadas aqui. A análise REA orientou a seleção do alvo e a leitura do pacote; a desmontagem Hermes adicional está documentada em `../../apk-audit/RELATORIO.md`.

O motor de recorrências e suas regras são implementação própria, fundamentada também nas regras do aplicativo anterior do usuário. Não se afirma recuperação do servidor Pierre, de sua IA ou de equivalência integral. Não houve instalação/execução do APK, contorno de integridade ou chamada a APIs privadas.

## Próximos passos

1. Mapeamento livre de colunas CSV e conciliação segura de extratos, sem duplicar pagamentos/transferências.
2. Mais cenários de ponta a ponta: cartão, restauração pelo seletor de arquivos e erros de armazenamento. O round-trip JSON foi validado automaticamente; o novo fluxo completo de restauração de arquivo não foi exercitado no navegador nesta rodada.
3. Quando chegar a etapa da troca de repositório, adaptar os módulos ao React/TypeScript do aplicativo próprio com ambiente e banco Neon de homologação.
4. Conectar Gemini por backend, com chave fora do frontend, quotas/erros visíveis e resposta real testada. O assistente atual continua local, sem LLM.

Não foram executadas migrações, publicação ou conexão com serviços financeiros. A autorização para testar não foi usada para alterar o banco de produção.
