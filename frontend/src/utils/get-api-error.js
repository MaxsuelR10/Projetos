export function getApiError(error) {
  const apiError = error.response?.data?.error

  if (apiError?.details?.length) {
    return apiError.details.map((detail) => detail.message).join(' ')
  }

  if (apiError?.message) return apiError.message
  if (error.code === 'ECONNABORTED') return 'A API demorou para responder.'

  return 'Não foi possível concluir a solicitação. Tente novamente.'
}
