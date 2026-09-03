export function getApiError(error, fallback = 'Não foi possível concluir a solicitação. Tente novamente.') {
  const apiError = error.response?.data?.error || error.response?.data

  if (Array.isArray(apiError?.details?.items)) {
    const dependencies = apiError.details.items
      .map((item) => `${item.count} ${item.label}`)
      .join(', ')
    return `Esta conta não pode ser excluída porque possui histórico vinculado: ${dependencies}. Desative a conta para preservar seus dados.`
  }

  if (apiError?.details?.length) {
    return apiError.details.map((detail) => detail.message).join(' ')
  }

  if (apiError?.code === 'ACCOUNT_HAS_DEPENDENCIES') return 'Esta conta possui histórico financeiro e não pode ser excluída. Use “Desativar” para preservá-lo.'
  if (apiError?.code === 'ACCOUNT_NOT_FOUND') return 'A conta não foi encontrada. Atualize a tela e tente novamente.'
  if (apiError?.code === 'ACCOUNT_NAME_IN_USE') return 'Já existe uma conta com este nome. Informe outro nome para continuar.'
  if (apiError?.message && apiError.code !== 'INTERNAL_ERROR') return apiError.message
  if (error.code === 'ECONNABORTED') return 'A API demorou para responder.'

  return fallback
}
