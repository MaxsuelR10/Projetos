# Próxima atualização — Mapeamento assistido de CSV

Status: concluída em 10/10/2026 como atualização 5. Veja [a entrega](update-5-csv-mapping-and-invoice-cycle.md).

## Objetivo

Permitir importar extratos com diferentes cabeçalhos e formatos sem editar o arquivo manualmente, preservando a prévia e as proteções contra duplicidade.

## Escopo sugerido para a atualização 5

1. Auditar o fluxo CSV existente e seus formatos já suportados.
2. Adicionar uma etapa de mapeamento: data, descrição, valor com sinal ou colunas separadas de débito/crédito.
3. Mostrar amostra e permitir confirmar separador, formato de data e separador decimal; ambiguidades exigem escolha explícita.
4. Salvar perfis de mapeamento por usuário/banco, sem guardar o conteúdo financeiro do arquivo no perfil.
5. Reutilizar a prévia atual, com erros por linha, duplicidades e saldo antes/depois, antes de qualquer gravação.
6. Orientar a abertura da conciliação da conta/mês depois de uma importação confirmada.

## Critérios de aceite

- CSV com cabeçalhos diferentes, valores negativos, débitos/créditos separados e datas brasileiras é interpretado corretamente.
- Datas e valores ambíguos não são importados silenciosamente.
- Perfil de outro usuário não é acessível.
- Prévia não altera saldo nem cria movimentos.
- Confirmação repetida preserva as proteções existentes e não duplica importação.
- Mapeamento funciona no celular e no desktop com arquivos sintéticos de auditoria.

Não inclui conexão bancária automática, envio de extratos à IA ou importação de dados reais sem escolha explícita do usuário.

