# Max com Gemini

O chat mantém as consultas locais existentes e acrescenta um modo Gemini opcional. O modo inicial é local. O seletor Gemini fica disponível quando a chave está configurada no servidor. A configuração não comprova que a chave ou a cota sejam válidas; indisponibilidade retorna resposta local identificada.

## Ativar localmente

1. Crie uma chave no [Google AI Studio](https://aistudio.google.com/apikey).
2. No `.env.local` do projeto, acrescente `GEMINI_API_KEY=sua-chave` e `GEMINI_MODEL=gemini-3.5-flash-lite`. Nunca envie o arquivo ao Git ou coloque a chave no chat, JavaScript público ou campos com prefixo VITE.
3. Reinicie `npm run dev` e recarregue a página.
4. Entre na sua conta, abra Fale com o Max, escolha Gemini e o período.
5. Teste uma pergunta e uma continuação. Cada resposta identifica Gemini ou cálculo local. Confira os números nas telas financeiras.

Na Vercel, cadastre as mesmas variáveis nos ambientes desejados e faça uma nova implantação. `MAX_AI_ENABLED=false` desativa o provedor sem impedir consultas locais. O modelo é configurável para acompanhar disponibilidade da sua conta.

## Dados e limites

- O servidor usa a sessão autenticada para ler somente `user:<id>` no Neon. Não aceita um estado financeiro nem papéis de sistema enviados pelo cliente.
- O cliente aguarda a sincronização antes da consulta; a revisão evita analisar um snapshot já desatualizado no momento da leitura.
- O resumo traz caixa, consumo, comparação com mês anterior, até 20 categorias, metas, pendências e compromissos agregados. Não envia nome do perfil, e-mail, nomes de contas, números de cartões ou descrições do extrato. Pergunta, últimas 8 mensagens e nomes das categorias ainda podem conter informação pessoal.
- Os valores são calculados pelo código financeiro existente. A interpretação do Gemini é probabilística: isso reduz erros, mas não garante que toda frase gerada esteja correta.
- Sem ferramentas de escrita: o Max não altera nem paga lançamentos. Sem consulta à internet ou aos bancos.
- Resposta limitada a 1.800 tokens, sem retentativas automáticas e timeout de 20 segundos no provedor. Erros não expõem prompt, chave ou corpo retornado pelo provedor.
- Até 6 chamadas por minuto por usuário e 1 simultânea por instância do servidor. Este limite em memória não é uma cota global entre instâncias da Vercel. Antes de abrir uso público amplo, aplicar limite distribuído e orçamento/cotas do provedor.
- Histórico salvo no estado da conta, como o chat anterior. Texto exibido com escape de HTML.

## Custo e privacidade do provedor

A API Gemini oferece faixas gratuitas com limites por modelo e projeto; não é uma garantia de uso ilimitado. A tabela do Google informa que conteúdo da faixa gratuita pode ser usado para melhorar produtos. Avalie isso antes de enviar informações financeiras pessoais. O aplicativo mostra a transferência ao Google antes do envio no modo Gemini.

Fontes consultadas em 24/10/2026: [modelos](https://ai.google.dev/gemini-api/docs/models), [preços](https://ai.google.dev/gemini-api/docs/pricing), [provedor Google do AI SDK](https://ai-sdk.dev/providers/ai-sdk-providers/google).

## Verificação

`npm test`, `npm run check`, `npm run check:server`. Os testes de IA usam provedor simulado, sem dados reais ou cobrança. Uma chamada real ao Gemini ainda depende da chave e cota disponíveis. Para verificar a ponta completa: entrar, registrar dados de teste, esperar Salvo no Neon, consultar Gemini e confirmar os valores e o histórico após recarregar.
