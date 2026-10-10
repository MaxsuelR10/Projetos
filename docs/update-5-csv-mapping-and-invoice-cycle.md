# Atualização 5 — CSV por banco e fatura mensal

Entregue localmente em 10/10/2026.

## Importação CSV

O fluxo agora é arquivo → mapeamento/amostra → prévia → confirmação. O usuário escolhe data, descrição e valor com sinal ou colunas separadas de débito/crédito. Delimitadores suportados: ponto e vírgula, vírgula e tabulação. Datas ISO, dia/mês/ano e mês/dia/ano; valores brasileiros ou com ponto decimal.

Detecção automática deixa datas e valores ambíguos para revisão. Débito e crédito não zerados na mesma linha não são escolhidos silenciosamente. Aspas abertas e quantidades de colunas incompatíveis também são sinalizadas. A precisão de até quatro casas é preservada para movimentos em conta; compras no cartão exigem centavos exatos.

Perfis por usuário guardam nome, cabeçalhos e mapeamento, sem conteúdo do extrato. Podem ser salvos, reutilizados e excluídos. O perfil só é oferecido para cabeçalhos iguais; a API rejeita uso com cabeçalho alterado ou acesso de outro usuário. Salvar o mesmo nome atualiza o perfil daquele usuário.

A prévia mantém edição por linha, categorias, regras, indícios de duplicidade e comparação de saldo antes/depois. Confirmação continua idempotente e atômica; salvar perfil ou gerar prévia não lança valores. Após importar, há acesso à conciliação.

## Corte e exibição da fatura

O fechamento é exclusivo: se fecha dia 3, compra do dia 2 entra na fatura que fecha naquele mês; compras nos dias 3 e 4 entram na seguinte. Parcelas posteriores seguem meses sucessivos. Em meses curtos o fechamento é limitado ao último dia existente, incluindo fevereiro bissexto.

O mês exibido é o do vencimento. Se o vencimento vem antes ou no mesmo dia numérico do fechamento, a fatura vence no mês seguinte ao fechamento. Exemplo: fechamento em 03/10, vencimento dia 1 → fatura de novembro; compra em 03/10 → fatura de dezembro.

A tela Cartões mostra uma fatura e somente as compras/parcelas que a compõem. É possível escolher outro mês, inclusive faturas pagas. O valor mostrado na lista de compras é a parcela daquele mês, não o total de uma compra parcelada. Limite utilizado/disponível continua representando todo o compromisso do cartão, com explicação na tela.

Na visão geral, selecionar um cartão oferece o mês da fatura. A composição por categoria e o gráfico mensal usam as parcelas da fatura, preservando gastos mesmo depois do pagamento. Faturas pagas são atribuídas ao mês de vencimento nessa visão. O caixa geral permanece na data real do pagamento. Saldo atual, projeção e agenda seguem suas próprias datas e rótulos. A visão geral abre inicialmente só o mês atual.

## Migrações e operação

- `20261010100000_csv_mapping_profiles`: perfis isolados por usuário.
- `20261010110000_invoice_closing_day_cutoff`: realinha parcelas de faturas não pagas e recompõe totais, preservando faturas pagas e saldos de contas. Opera em transação; aborta se o novo destino já estiver pago.

Ambas foram aplicadas ao banco local. A atualização não foi publicada em produção. A publicação segue o processo habitual, com migrações incluídas.

Verificação de dados após migração: na pasta backend, `node scripts/verify-invoice-cutoff.mjs`. É somente leitura e informa quantidades de competências/totais divergentes sem imprimir dados financeiros.

## Validações

- Suíte completa: 112 testes aprovados em 27 arquivos.
- Após proteção adicional de centavos no cartão: 23 testes pertinentes aprovados.
- Frontend: lint e build aprovados.
- Chrome: seleção de outubro/novembro, corte dia 3, compras filtradas, gráficos, upload, mapeamento, perfil, datas ambíguas, prévia e confirmação aprovados.
- Desktop 1440 px e celular 390 px inspecionados, sem transbordamento horizontal.
- Verificação pós-migração: duas faturas abertas e três parcelas verificadas, nenhuma competência ou total divergente.

O teste prático usa usuário separado e remove somente seus registros temporários. Para repetir: API localhost:3000, frontend 127.0.0.1:5173 com `VITE_API_URL=/api`, Chrome instalado, depois `node scripts/smoke-update5.mjs` na pasta backend.

Próximo passo sugerido: [conferência guiada de divergências](next-update-guided-reconciliation.md).
