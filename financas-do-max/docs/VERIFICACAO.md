# Verificação da versão local

## Versão 1.3.0 — 22/10/2026

- `npm run check` aprovado; `npm test`: 86 testes, zero falhas.
- Recorrências com data-âncora, geração sem duplicação, cartão protegido, backups antigos e novos, calendário, operações financeiras e histórico validados automaticamente.
- Navegador isolado na porta 4174: geração em prévia/confirmada, ausência de débito pendente, liquidação única, cancelamento, restauração, classificação de assinatura, pausa/retomada vinculada, revisão sem repetição, calendário e histórico antes/depois conferidos com dados fictícios.
- Tela móvel: 390 × 844 solicitados, área útil de 375 px e documento de 375 px. Grade compacta sem overflow da página; valores completos nos detalhes e rótulos acessíveis.
- As novas operações não foram executadas sobre os dados do usuário na origem 4173. Nenhuma alteração no banco Neon, no backend ou no repositório anterior; nenhuma publicação.
- O assistente continua local, sem Gemini. Ver os detalhes e limites em `ETAPA-2-RECORRENCIAS.md`.

## Verificação inicial — versão 1.0.0

Executada em 21/10/2026.

- `npm run check`: passou para os módulos de interface, domínio e servidor.
- `npm test`: 14 testes passaram, sem falhas.
- HTTP local: status 200 em `http://127.0.0.1:4173/`.
- Navegador desktop: painel carregou com gráficos, valores calculados e navegação.
- Criada uma despesa fictícia de R$ 12,34 pela interface, com descrição contendo `<seguro>`; o texto foi apresentado literalmente.
- Recarregada a página: a transação permaneceu salva.
- Busca: encontrou a transação criada.
- Ocultação/restauração: ambos os controles funcionaram; não houve exclusão do lançamento.
- Assistente: respondeu à sugestão “Quanto gastei este mês?” com os totais incluindo a despesa de teste.
- CSV enviado pelo seletor de arquivo da interface: duas linhas fictícias importadas, com R$ 45,67 de despesas, R$ 100,00 de receitas e R$ 54,33 de resultado.
- Agentes: “Verificar agora” apresentou o resultado das regras e a seção de última verificação.
- Tela de celular: viewport solicitado de 390 × 844 (área útil observada de 375 px). Painel, menu e agentes conferidos visualmente. Corrigido overflow causado por um texto acessível de cabeçalho da tabela; a largura do documento e da área útil ficou em 375 px.
- Demonstração restaurada depois dos testes; registros temporários e mensagens de teste foram removidos por esse fluxo.
- Console da aba de teste: nenhum erro retornado na leitura final.

Os testes não abrangem integrações externas, pois elas não estão implementadas. Backup JSON é validado pelo teste de domínio; o fluxo completo de restauração de arquivo não foi exercitado no navegador. O exame da conta original foi somente leitura.

## Publicação

Site privado reservado: `appgprj_6ad94d9f391481918aaba59a5049168d`.

A tentativa de iniciar o fluxo de envio do código foi bloqueada antes da execução pela revisão automática de permissões. Nenhum push, salvamento de versão ou deploy foi executado. O endereço esperado do Site ainda não confirma publicação. O motivo informado foi a ausência de autorização explícita para enviar o código ao destino externo e publicar, mesmo com acesso privado. A versão local continua disponível e o código foi preservado.
