# Registro de reconstrução

Data: 21/10/2026. Fonte: sessão autenticada, fornecida pelo usuário, em `https://pierre.finance/`. Método: observação de DOM, acessibilidade e screenshots pela ferramenta de navegador. Essas observações **não são Evidence do REA**. O MCP do REA não está exposto nesta sessão; a skill orientou a separação entre fatos observados, inferências e implementação própria.

Nenhum formulário foi enviado, nenhum agente original foi ativado/desativado e nenhuma transação original foi criada/editada. Foram abertas e fechadas telas e diálogos apenas para ler sua estrutura. Não foram copiados extratos, credenciais, respostas privadas de APIs ou ativos de marca para a aplicação nova.

| Área | Evidência observada | Resultado nesta versão |
| --- | --- | --- |
| `/chat` | Histórico na lateral, mensagem inicial, sugestões, campo de mensagem, anexos e opção Computer | Interface de conversa própria e respostas determinísticas sobre dados locais. Anexos arbitrários e Computer não implementados. |
| `/dashboard` | Menu lateral, seis abas, resumo de gastos, comparativo, gráfico acumulado, contas, limite, mapa de calor, categorias, transações e assinaturas | Painel equivalente alimentado pelo estado local. Texto de insight produzido por regras. |
| `/dashboard/transactions` | Mês, contas, tipo, ordenação, categorias, ocultos, busca, tabela e paginação | Filtros e operações locais funcionais. |
| Nova transação | Valor, descrição, categoria, débito/crédito, data e moeda | Cadastro/edição local em BRL. Transferências explícitas com duas contas são uma escolha própria. Moedas estrangeiras não implementadas. |
| `/dashboard/installments` | Totais, já pago, restante, progresso e listagem em andamento/finalizada | Cadastro e progresso manual, sem inferir pagamentos bancários. |
| `/dashboard/subscriptions` | Ativas, custo mensal, projeção anual, média e cadastro | Serviços mensais/anuais locais com edição e pausa. |
| `/dashboard/categories` | Mês, agrupamentos e gastos por categoria | Categorias locais com orçamentos (extensão própria) e atalhos para transações. |
| `/dashboard/cards` | Fatura atual, cartão, vencimento, limite usado/disponível, faturas anteriores | Cartões manuais, soma de compras por mês e visualização dos lançamentos. Ciclos oficiais e faturas anteriores não integrados. |
| `/agents` | Sugestões, agentes, ativação, frequência; diálogo “Novo agente” com descrição | Agentes próprios baseados em regras tipadas; nenhuma chamada para o backend original. |
| `/investments` | QR e informação de acesso aos investimentos pelo app móvel | Carteira manual é uma extensão de projeto, não um fluxo interno recuperado. |
| Seletor de contas | Instituições, atualização e “Adicionar conta” | Gestão manual própria, sem conexão bancária simulada. |

## Cobertura e lacunas

As estruturas de interface acima foram observadas. O comportamento de servidores, modelos de IA, prompts internos, sistema de recomendações, consentimento bancário, autenticação e produtos financeiros permanece desconhecido e não foi recuperado. Não há paridade integral com o serviço Pierre. Os fluxos locais correspondentes foram implementados com código original e exemplos fictícios; recursos que dependem de terceiros são sinalizados na interface e no README.

O APK fornecido anteriormente foi identificado pelo manifesto como `cm.aptoide.pt`, versão `9.22.5.3`, SHA-256 `188bbdb899be2da401ac0471ba4d10693612fa1067f2ea0987cc6e1afcfd4374`. Ele não foi usado na reconstrução do Pierre.
