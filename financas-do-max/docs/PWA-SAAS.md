# PWA e preparação para mensalidades

## Diagnóstico

O checkout ativo serve HTML, CSS e módulos ECMAScript diretamente de `dist`. O servidor local usa `node:http`; na Vercel, `api/index.mjs` encaminha para a mesma API. Banco Neon/PostgreSQL, login Neon Auth e Prisma para operações do assistente. Sem React, Vite ou Express nesse checkout. A configuração já declarava um manifest standalone, ícones comuns, orientações de instalação, viewport para áreas seguras e um service worker usado por push. Faltavam ícones maskable dedicados, aviso offline e aviso de atualização por implantação.

## PWA

- Manifest com escopo, identidade e entrada em `/`, ícones comuns e maskable de 192 e 512 px e ícone Apple de 180 px. A Vercel fornece HTTPS ao publicar. Localhost é aceito para desenvolvimento.
- Chrome recebe a opção **Instalar aplicativo** quando o navegador disponibiliza o prompt. Safari no iPhone recebe a ajuda de instalação manual. O convite fica escondido dentro do app standalone.
- O worker busca o documento de entrada pela rede e só fornece uma página estática de erro se a rede falhar. A API e os demais recursos ficam fora do Cache Storage. Nenhuma operação financeira entra em fila offline. A interface informa perda de conexão e só confirma as gravações após resposta do servidor.
- HTML, manifest, worker e módulos sem nome versionado são revalidados. A página consulta a identidade da implantação Vercel ao abrir, voltar à aba, reconectar e a cada minuto enquanto visível. O botão de atualização depende de rede e bloqueia recarga com modal aberto ou sincronização pendente/falha. Em caso de falha, exporte o backup e recarregue manualmente.
- Na passagem para esta versão, abas antigas recebem HTTP 409 ao salvar sem o identificador da sessão. Antes de publicar uma alteração incompatível posterior, mantenha o contrato anterior em paralelo ou introduza uma nova versão de API e recuse a anterior com instrução de atualização. O aviso de atualização por si só não é versionamento de API.

## Isolamento de clientes

| Dados ou ação | Como a API limita o acesso |
| --- | --- |
| Contas, cartões, transações, categorias, parcelas, assinaturas, investimentos, metas, orçamentos | O documento financeiro tem chave `user:<id>`, obtida da sessão Neon Auth validada pelo servidor. SELECT, INSERT e UPDATE usam essa chave. IDs internos e campos de identidade no JSON não escolhem o documento. |
| Faturas e dashboard | Derivados a partir do documento financeiro da conta autenticada. |
| Assistente e operações pendentes | Leitura filtrada por usuário. Token de confirmação/cancelamento associado ao usuário. Confirmação e gravação atômicas com verificação de revisão. |
| Push | Rotas privadas, busca e remoção por proprietário. O upsert só altera uma inscrição já existente quando ela pertence ao usuário autenticado. O cron exige o segredo separado e percorre os usuários no servidor. |
| Login, cadastro e recuperação | Cookie lacrado, HttpOnly, SameSite=Lax e Secure na Vercel. A API consulta o provedor para validar a sessão. Sessões ausentes ou expiradas recebem 401 nas rotas privadas. A solicitação de recuperação retorna mensagem genérica e delega a entrega ao Neon Auth. |

A API compara o usuário esperado pela aba com o usuário efetivo da sessão. O cabeçalho serve apenas para detectar troca de conta, sem autorizar nenhuma sessão. Antes, uma aba de Alice poderia salvar seu estado na conta de Bob se outra aba trocasse o cookie e as revisões coincidissem. Também havia um DELETE de inscrição push sem exigir o proprietário, substituído por um upsert condicional e atômico. O cliente deixou de oferecer importação automática do backup antigo sem identificação do dono. O backup legado permanece no navegador e a restauração por arquivo segue disponível.

A API usa `no-store`; o código não registra payload financeiro, cookies ou credenciais nas rotas revisadas. O navegador ainda guarda a cópia local já existente por conta. Como as contas do mesmo navegador usam a mesma origem, esse armazenamento não é uma barreira contra scripts executados na origem ou acesso ao perfil do navegador. Antes de comercializar, revisar retenção dessas cópias, CSP, limites de tráfego no login/cadastro/reset e políticas de acesso ao banco. Verificar RLS, grants e acesso do usuário de runtime em uma branch de teste. O isolamento aqui é aplicado pelo backend; o teste de SQL do push usa um substituto, e os testes de integração não consultam o banco real. Validar envio e chegada de recuperação por e-mail com uma conta de teste antes do lançamento.

## Arquitetura comercial proposta

1. Começar com uma conta financeira por usuário, mantendo a chave atual. Criar uma entidade separada de assinatura do produto associada ao ID autenticado. Assinaturas financeiras que o cliente registra na tela continuam sendo lançamentos pessoais.
2. Modelar status `trialing`, `active`, `past_due`, `suspended` e `canceled`, com início, fim do teste, próxima renovação e tolerância. Definir a transição e a reativação no backend. Prever leitura, exportação e recuperação de conta durante suspensão, conforme política a definir.
3. Guardar cobranças e eventos em tabelas separadas. Quando houver gateway aprovado, verificar assinatura de webhooks, registrar IDs únicos e processar de forma idempotente dentro de uma transação. Não confiar no retorno do navegador para liberar acesso.
4. Área administrativa com função distinta, concessão explícita, trilha de auditoria e acesso comercial mínimo. Permissões de produto serão conferidas na API. O administrador de cobrança não precisa consultar lançamentos.
5. Propor e revisar migrações aditivas numa branch Neon de desenvolvimento, com rollout inicial sem bloqueios para usuários atuais. Antes da produção, aprovar o modelo de negócio, recuperação de incidentes e verificação em dois clientes independentes. Riscos principais: duplicidade de eventos, bloqueio indevido e escopo de acesso administrativo.

## Instalação

**Android** — Abra o endereço HTTPS no Chrome, use **Instalar aplicativo** quando oferecido ou a opção de instalação do menu do Chrome. Confirme, abra pelo ícone e confira se a barra de endereço sumiu. O menu pode oferecer apenas um atalho em ambientes que não concedem instalação.

**iPhone** — Abra o endereço HTTPS no Safari. Toque em **Compartilhar**, **Adicionar à Tela de Início**, ative **Abrir como App** se aparecer e confirme em **Adicionar**. Abra pelo ícone para conferir o modo standalone.

**Atualização** — Abra o app com internet. Ao aparecer **Atualizar aplicativo**, termine os formulários, espere a confirmação da sincronização e toque no botão. Se fechou o aplicativo, a próxima abertura conectada busca a versão disponível no servidor.

## Verificação local

Execute `npm test` e `npm run build`. Neste checkout, `dist` contém o código estático pronto para servir. O build local gera o Prisma Client, verifica a sintaxe e valida os ativos PWA. O empacotamento final dos builders da Vercel é uma etapa separada.

Para o teste de navegador, disponibilize `playwright-core` em uma pasta de ferramentas (variável `PLAYWRIGHT_PATH`, caminho absoluto do módulo) e rode `npm run test:pwa:browser`. Use `CHROME_PATH` para um executável de Chromium fora do caminho padrão do Chrome no Windows. O servidor do teste usa credenciais e dados fictícios em memória e não chama Neon, e-mail ou Web Push reais.

Em aparelhos físicos, conferir instalação, modo standalone, ícone, retorno e logout, sessão depois de reabrir, notch e áreas seguras em retrato/paisagem, teclado com moeda e datas, selects nativos, modais, gráficos e atualização entre duas versões HTTPS.

## Arquivos desta etapa

- Criados em `dist`: `pwa-status.mjs`, `apple-touch-icon.png`, `icon-maskable-192.png` e `icon-maskable-512.png`.
- Modificados em `dist`: `app.mjs`, `index.html`, `install-app.js`, `manifest.webmanifest`, `mobile-app.css`, `remote-storage.mjs`, `sw.js` e `ui-notifications.mjs`.
- Backend e configuração: `http-api.mjs`, `push-repository.mjs`, `vercel.json` e `package.json`.
- Verificação: `tests/pwa.test.mjs`, `tests/tenant-isolation.test.mjs` e `scripts/test-pwa-browser.mjs`. O driver de navegador é opcional e externo ao projeto. Nenhuma dependência foi adicionada ao pacote.
