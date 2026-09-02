export function getApiError(error, fallback = 'Não foi possível concluir a solicitação. Tente novamente.') {
  const apiError = error.response?.data?.error

  if (apiError?.details?.length) {
    return apiError.details.map((detail) => detail.message).join(' ')
  }

  if (apiError?.message && apiError.code !== 'INTERNAL_ERROR') return apiError.message
  if (error.code === 'ECONNABORTED') return 'A API demorou para responder.'

  return fallback
}
