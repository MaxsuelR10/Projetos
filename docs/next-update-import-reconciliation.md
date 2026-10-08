# Próxima atualização — Importação com prévia e reconciliação

Status: pronta para iniciar no próximo ciclo.

## Objetivo

Transformar a importação CSV em um fluxo seguro de conferência, no qual nenhum
lançamento é criado antes de o usuário entender o efeito do arquivo.

## Fluxo proposto

1. Selecionar conta, tipo padrão, forma de pagamento e arquivo CSV.
2. Ler o arquivo e abrir uma prévia sem gravar movimentações.
3. Exibir cada linha normalizada com data, descrição, valor, categoria sugerida
   e sinalização de possível duplicidade.
4. Permitir incluir, ignorar ou corrigir cada linha antes da confirmação.
5. Mostrar um resumo com saldo atual, total de entradas, total de saídas e saldo
   estimado após a importação.
6. Confirmar somente as linhas selecionadas e apresentar o resultado final com
   quantidades importadas, ignoradas e recusadas.

## Regras essenciais

- A prévia não altera saldo nem cria lançamentos.
- A detecção de duplicidade deve considerar conta, data, valor e descrição
  normalizada, sem bloquear falsos positivos automaticamente.
- Cada linha deve ter um identificador de importação para impedir reenvio
  acidental da mesma operação.
- Linhas inválidas permanecem visíveis com uma explicação clara e podem ser
  corrigidas ou ignoradas.
- A confirmação deve ser atômica: falha inesperada não pode deixar uma
  importação pela metade.
- O arquivo original não deve permanecer armazenado após o processamento.

## Critérios de aceite

- Um CSV válido chega à tela de prévia sem mudar o saldo.
- Duplicidades prováveis aparecem destacadas e desmarcadas por padrão.
- O saldo antes/depois coincide com a soma das linhas selecionadas.
- Alterar categoria ou ignorar uma linha atualiza o resumo imediatamente.
- Confirmar duas vezes a mesma importação não duplica movimentos.
- O resultado informa importados, ignorados, duplicados e erros.
- O fluxo funciona em celular e desktop e possui estados de carregamento,
  vazio e erro recuperável.

## Ordem de implementação

1. Contrato de prévia no backend e identificador idempotente.
2. Detecção e classificação de duplicidades.
3. Tela de revisão por linha e resumo de impacto.
4. Confirmação transacional.
5. Testes de integração, CSVs de exemplo e validação visual responsiva.

## Casos de teste preparados

- CSV com despesas válidas.
- CSV misto com entradas e saídas.
- Datas e valores em formatos brasileiros.
- Cabeçalhos desconhecidos e colunas ausentes.
- Duas linhas iguais no mesmo arquivo.
- Operação já existente no sistema.
- Correção manual de categoria antes de confirmar.
- Falha durante a confirmação com rollback integral.
