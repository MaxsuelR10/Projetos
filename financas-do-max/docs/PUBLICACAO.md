# Versão autenticada — preparação para publicação

O aplicativo definitivo está em `financas-do-max/`, separado do frontend/backend antigo. Use essa pasta como Root Directory na Vercel. O projeto de design `ab-designer-vitrine` é independente.

## Login e dados

O Neon Auth existente fornece cadastro e login por e-mail/senha. A sessão é verificada no serviço de autenticação em cada requisição de dados. O servidor guarda a sessão em cookie HttpOnly criptografado; produção exige Secure. A identidade autenticada determina a chave `user:<id>`; o cliente não escolhe o workspace. O cache do navegador também é separado por usuário. Cada conta começa vazia; importar o estado antigo deste navegador exige confirmação na primeira entrada. As tabelas antigas do Neon e o documento `max-local` são preservados; não existe migração automática do sistema antigo.

## Vercel

1. Configure a pasta raiz `financas-do-max` da branch de preparação em um projeto de prévia ou deployment de prévia. Preserve a produção atual até validar.
2. Cadastre DATABASE_URL, NEON_AUTH_URL, SESSION_SECRET e APP_ORIGIN como variáveis de servidor. Use segredo aleatório de pelo menos 32 caracteres; nunca copie `.env.local` para o Git. APP_ORIGIN é o endereço HTTPS exato de acesso (sem barra final); múltiplas origens podem ser separadas por vírgula.
3. Cadastre o endereço da prévia na lista de domínios confiáveis do Neon Auth. Ao publicar, cadastre também o endereço definitivo e ajuste APP_ORIGIN.
4. Use `vercel.json`: arquivos estáticos de dist e função Node de api/index.mjs. Node 22 ou superior. As configurações antigas de Build/Output/Root precisam ser revisadas para essa pasta.
5. Crie sua conta pela interface e valide login, gravação, recarregamento, saída e segunda conta. Depois publique a versão testada. A integração Gemini permanece uma etapa independente.

## Testes

## GitHub

Destino: `MaxsuelR10/Projetos`. O plugin confirmou leitura, mas a criação da branch foi recusada com 403 (Resource not accessible by integration). O processo do Codex também não conseguiu desbloquear a chave SSH (Permission denied publickey). Nenhuma branch ou commit remoto foi criado.

No PowerShell onde o SSH já funcionou, execute `& '.\scripts\Publish-Git.ps1'` a partir da pasta deste aplicativo. O script clona Projetos em `.publish-projetos`, cria `codex/financas-max-neon-auth`, copia uma lista explícita de arquivos de código sem credenciais, cria um commit e envia a branch. Ele preserva a main e não publica produção. Se a branch já existir ou houver checkout anterior, interrompe para revisão.

## Verificação

`npm ci`, `npm run check`, `npm test`. `node scripts/test-neon.mjs` exige `.env.local` e testa Neon/Auth reais em duas contas técnicas de e-mail example.invalid, sem e-mails externos. Essas contas e seus registros fictícios são preservados para conferência. O teste cobre sessão após reinício, isolamento, logout/login, validação e conflitos de revisão.
