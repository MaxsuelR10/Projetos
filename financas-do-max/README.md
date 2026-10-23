# Finanças do Max

Aplicação web independente, com código próprio, baseada nos fluxos observados em uma sessão autorizada do Pierre Finance. Esta versão não é uma recompilação do servidor do Pierre nem é afiliada ao produto original.

## Executar

Requer Node.js 22 ou superior. Execute `npm ci` para instalar o driver oficial do Neon. O servidor lê `DATABASE_URL` e `NEON_WORKSPACE` do arquivo privado `.env.local` (ignorado pelo Git).

```powershell
cd "C:\Users\Maxsuel\OneDrive\Imagens\ProjetoBia\Finanças do max\financas-do-max"
npm start
```

Abra http://127.0.0.1:4173. A porta pode ser alterada com a variável `PORT`.

## Funcionalidades implementadas

- Visão geral com receitas, despesas, comparação mensal, gráfico acumulado, calendário de gastos, categorias, contas e assinaturas.
- Transações com cadastro e edição, transferência entre contas, busca, ordenação, paginação, filtros por mês/conta/tipo/categoria/dia e ocultação reversível.
- Contas manuais e cartões com limite, fechamento, vencimento, últimos quatro dígitos, faturas por mês e registro local de pagamentos.
- Compras de cartão divididas em parcelas exatas em centavos, progresso vinculado às faturas e controle manual separado de outros parcelamentos.
- Situação pendente, paga/recebida ou cancelada; saldo alterado somente por liquidações e transferências efetivadas.
- Alternância entre caixa, consumo por data da compra e visão de uma fatura por mês de vencimento.
- Assinaturas mensais/anuais, projeção anual, calendário por dia/semana/mês, cadastro, edição e pausa do acompanhamento.
- Recorrências diárias, semanais, mensais e anuais, com intervalos, término, prévia e geração confirmada sem repetir ocorrências.
- Registro de pagamento/recebimento, cancelamento e restauração preservando o lançamento; identificação de assinaturas sem criar outro débito.
- Histórico local com campos antes/depois, limitado a 300 eventos e incluído no backup.
- Categorias editáveis com orçamento e indicação de estouro.
- Assistente financeiro local que calcula resumos, compara meses, detalha categorias e encontra possíveis duplicatas.
- Agentes locais com regras de orçamento, resumo e duplicatas, ativação e execução manual.
- Carteira manual de investimentos (uma extensão de produto; a página web de referência apenas direcionava ao app móvel).
- CSV de extratos com prévia paginada, seleção de registros, duplicatas e projeção de saldo antes da confirmação; exportação CSV, backup/restauração JSON validada e limpeza para começar com dados próprios.
- Interface responsiva, foco em diálogos, navegação por teclado e escape de conteúdo fornecido pelo usuário.

## Dados e integrações

Os exemplos são **fictícios**. Os registros do projeto novo são persistidos no Neon em `public.financas_max_state`, em um documento JSONB validado que abrange todas as entidades e seus vínculos. As tabelas do sistema antigo permanecem independentes; seus dados ainda não foram migrados para o novo formato. Uma revisão numérica protege contra sobrescrita concorrente. A interface mostra o andamento de cada gravação e mantém uma cópia no navegador. Na primeira abertura, um espaço vazio recebe o estado local validado; nas seguintes, carrega o Neon. Uma versão local diferente é preservada na chave `STORE_KEY:before-neon`. Em caso de falha, exporte o backup antes de recarregar. O sistema interrompe novas alterações após falha de sincronização.

O cadastro e o login por e-mail/senha usam o Neon Auth existente. Cada sessão é validada no provedor antes de acessar os dados. A identidade autenticada define o espaço `user:<id>` no servidor e uma chave de cache separada no navegador. Cookies de sessão são criptografados e HttpOnly; em produção também exigem HTTPS (Secure). O usuário pode sair da conta pelo rodapé. Na primeira entrada pode confirmar a importação dos dados anteriores deste navegador. As credenciais de banco ficam exclusivamente no servidor. Para publicar na Vercel, configure as variáveis privadas, a pasta raiz e a lista de origens permitidas, conforme `docs/PUBLICACAO.md`.

Para testar a integração real: `node scripts/test-neon.mjs`. O teste usa um workspace exclusivo de dados fictícios, preservado para conferência; testa gravação/leitura integral, conflito concorrente, validação, origem e persistência após reinício.

O assistente usa regras e cálculos locais, **não um modelo de IA**. Os agentes verificam regras ao abrir a aplicação e em “Verificar agora”; a frequência desejada é armazenada, sem execução agendada quando o aplicativo está fechado. Integrações Open Finance, WhatsApp, notificações externas, cotações, negociação, produtos de crédito e IA externa não estão configuradas.

O painel abre em regime de caixa: somente pagamentos e recebimentos efetivados, pela data de liquidação. Em consumo, despesas não canceladas e compras de cartão entram na data da compra; o pagamento da fatura é excluído para não duplicar o gasto. O saldo de abertura é anterior aos registros. Pendências e cancelamentos não alteram o saldo.

O fechamento de fatura é exclusivo: se fecha dia 3, compras nos dias 3 em diante entram no próximo ciclo. O mês mostrado é o do vencimento. Dias inexistentes são limitados ao fim do mês. Uma compra de R$ 100,01 em três parcelas gera R$ 33,34, R$ 33,34 e R$ 33,33. O limite comprometido considera todas as parcelas ainda não pagas, e não apenas a fatura selecionada.

Registrar um pagamento de fatura cria uma única saída na conta escolhida e libera apenas o valor das parcelas pagas. Não há operação bancária real. A compra vinculada e o registro de pagamento ficam protegidos contra edição isolada e segundo pagamento. Alteração de ciclo em cartão já pago exige migração de histórico e está bloqueada nesta etapa. Cartões antigos sem dia de fechamento mantêm o comportamento por mês civil até o usuário completar a configuração; nenhum dia é adivinhado na migração.

Transferências efetivadas afetam as duas contas sem inflar receitas/despesas. Uma assinatura cadastrada ou uma previsão no calendário não cria débito. Para programar lançamentos, vincule uma recorrência, revise a prévia e confirme. Em conta, a geração cria pendências; no crédito, cria compras de uma parcela que comprometem o limite, sem debitar o saldo em conta. Controles manuais de outros parcelamentos não geram lançamentos; os parcelamentos de cartão acompanham suas faturas. Ocultar um lançamento o retira dos relatórios comuns, sem apagar seu efeito no saldo ou no compromisso do cartão. A fatura mantém todos os seus itens, inclusive os ocultos.

### Recorrências e histórico

Em “Vision → Recorrências”, cadastre uma regra e use “Revisar lançamentos”. A análise não grava dados; a confirmação gera somente ocorrências até a data atual, em lotes de até 1.000. Uma regra mensal iniciada em 31/01 mantém a referência: 28/02 e 31/03. Datas originais já processadas ficam protegidas; a liquidação pode ocorrer em outro dia. Pausar preserva o histórico; retomar exige nova revisão e pode incluir ocorrências vencidas durante a pausa. Regras concluídas permanecem encerradas.

Cada ocorrência possui identidade por regra/data. Outra revisão não recria lançamentos, mesmo cancelados. Coincidências exatas com um lançamento manual não cancelado são ignoradas conservadoramente e contam como processadas; a prévia informa isso. Regras distintas representam obrigações distintas, mesmo com valores iguais. A geração não funciona em segundo plano quando o aplicativo está fechado.

O histórico registra alterações a partir desta versão, com até 300 eventos, 50 mudanças detalhadas por evento e textos limitados a 240 caracteres; informa truncamentos. É um recurso local de conferência, não uma auditoria imutável de servidor nem uma cópia integral de todos os dados antigos. Backups anteriores sem os novos campos continuam aceitos. Veja `docs/ETAPA-2-RECORRENCIAS.md`.

### CSV

Colunas obrigatórias: `data`, `descricao`, `valor`. Opcionais: `tipo`, `categoria`. Aceita vírgula ou ponto e vírgula, datas ISO ou DD/MM/AAAA, aspas e decimais brasileiros. Com `tipo` ausente, valor negativo é despesa e positivo é receita. `tipo=despesa` ou `tipo=receita` prevalece sobre o sinal. “Analisar extrato” não grava nada: abre a prévia com seleção, categorias, possíveis duplicatas e saldo antes/depois. Confirme para gravar somente os selecionados como efetivados. A conferência é recalculada na confirmação.

Duplicatas existentes ou no mesmo arquivo usam data, valor, descrição normalizada, tipo e conta. Compras no cartão e cancelamentos não bloqueiam uma movimentação comum de conta com os mesmos campos. Um pagamento de fatura já registrado em conta bloqueia um débito CSV correspondente para evitar baixa dupla. Repetições legítimas podem ser cadastradas manualmente. Limite: 5 MB / 10.000 linhas, prévia de 50 registros por página. Mapeamento livre de colunas e conciliação bancária avançada continuam pendentes. Transferências e pagamentos de fatura devem ser registrados pelas telas correspondentes ou restaurados por JSON. O CSV exportado é para análise e não substitui o backup completo, que preserva vínculos e situações.

## Verificação

```powershell
npm run check
npm test
```

Os 86 testes cobrem valores em centavos, transferências, faturas, limites, pagamento único, caixa/consumo, pendências, CSV, prévia/seleção/saldo, recorrências, calendário, liquidação/cancelamento/restauração, auditoria, validação de backup, duplicatas e agentes. O ciclo foi adicionalmente comparado em 7.080 casos com a função do aplicativo existente, sem divergências. Veja `docs/ETAPA-1.md`, `docs/ETAPA-2-PREVIA.md`, `docs/ETAPA-2-RECORRENCIAS.md`, `docs/ETAPAS.md` e `docs/OBSERVACOES.md`.
