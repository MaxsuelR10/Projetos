# Cartões e notificações no celular — 31/10/2026

Os dias do cartão deixavam de aceitar digitação porque a máscara aplicava `slice(0, -1)` quando o navegador retornava `maxLength = -1`. A máscara agora só corta valores quando existe um tamanho máximo positivo. Fechamento e vencimento usam teclado numérico, permitem apagar e redigitar, e validam dias de 1 a 31. O formulário, a apresentação e os novos cartões não usam os quatro últimos números; backups anteriores continuam aceitos.

O sino de avisos também ficava escondido pelo CSS mobile. Agora permanece acessível em telas pequenas, com uma página para contas, faturas e orçamento.

## Avisos

- Faturas e despesas pendentes: até três dias antes e no vencimento; faturas vazias/pagas e contas pagas/canceladas não geram aviso.
- Orçamento geral mensal e por categoria: 80% e 100%, pelo consumo, sem contar o pagamento da fatura duas vezes. O limite geral é configurável no perfil; zero desativa esse limite.
- Novas despesas pendentes cadastradas: um aviso após gravar com sucesso. Editar não repete o aviso e a importação inicial do espaço não notifica todo o histórico.
- Cada evento tem chave persistida por aparelho. Reservas atômicas evitam disparos simultâneos; falhas temporárias podem ser repetidas e inscrições expiradas são removidas.
- Uma verificação agrupa os eventos em uma notificação. A tela bloqueada não recebe valores, descrições ou nomes de cartões; os detalhes exigem entrar no aplicativo.

A permissão só é solicitada ao tocar em **Configurações → Ativar notificações**. Há botões para testar e desativar naquele aparelho. A saída da conta cancela a inscrição local. No iPhone/iPad, o site precisa estar adicionado à Tela de Início e ser aberto pelo ícone. O service worker não guarda dados financeiros nem respostas autenticadas em cache.

## Servidor

`push-service.mjs` envia Web Push, `push-repository.mjs` persiste inscrições e entregas no banco existente e `dist/notification-rules.mjs` compartilha as regras entre servidor e interface. As rotas de inscrição e teste exigem sessão e a proteção de origem existente. O endpoint diário exige `Authorization: Bearer CRON_SECRET`; sem segredo ele permanece fechado. Somente provedores de push conhecidos são aceitos como destino.

As variáveis privadas são `VAPID_PRIVATE_KEY` e `CRON_SECRET`. `VAPID_PUBLIC_KEY` é pública e `VAPID_SUBJECT` identifica o responsável pelo serviço. Foram configuradas no projeto Vercel existente `app-financas`, sem arquivos de segredo no código. O cron em `vercel.json` verifica vencimentos diariamente às 12h UTC (9h de São Paulo; o provedor pode atrasar). Gravações também verificam orçamento e novos lançamentos. Outros hosts precisam chamar o mesmo endpoint diariamente com o segredo.

`prisma/notifications-additive.sql` cria somente as tabelas auxiliares de inscrições/entregas. Foi aplicada primeiro na branch de teste `br-raspy-hall-acld98xd`, com expiração em 02/11/2026 às 22h UTC. O teste `scripts/test-push-db.mjs` confirmou isolamento, reserva concorrente, retentativa, deduplicação e supressão do alerta de 80% após 100%. Depois, a mesma migração foi aplicada na produção `br-floral-recipe-acwnrwls`, sem alterar documentos financeiros.

## Validação

`npm run check`, `npm run check:server` e os 134 testes automatizados passaram. Os testes incluem as regras, permissão recusada, orientação de instalação no iOS, inscrição/desinscrição, falha de cadastro e isolamento da API.

No navegador, em 390×844 e 360×800: digitação tecla a tecla dos dias 31/10, salvar sem números do cartão, persistir ao recarregar, editar, recusar dia 32, salvar limite mensal, registrar despesa pendente e abrir os avisos de vencimento/85% pelo sino. Os dados de navegador são fictícios, em sandbox na memória; não foram gravados na conta pessoal.

O recebimento no sistema operacional de um telefone físico, com o aplicativo fechado, depende de ativar a permissão naquele aparelho e usar o botão de teste. Essa entrega física não foi validada pelo ambiente de desenvolvimento.

A publicação usa um snapshot dos arquivos locais no projeto Vercel existente. O código local deve ser levado ao GitHub antes de futuros deploys pela branch principal, para que esses deploys preservem as correções.
