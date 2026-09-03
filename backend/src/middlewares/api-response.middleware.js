// Keeps established resource keys during the transition while exposing the
// canonical envelope for all clients: { success, data, message? }.
export function apiResponse(_request, response, next) {
  const sendJson = response.json.bind(response);

  response.json = (payload) => {
    if (payload?.success !== undefined) return sendJson(payload);
    // The session probe deliberately remains a small state object so callers
    // can distinguish an anonymous session from an API failure.
    if (payload?.authenticated === false) return sendJson(payload);
    if (payload?.error) {
      const { code, message, details } = payload.error;
      return sendJson({ success: false, code, message, ...(details ? { details } : {}), error: payload.error });
    }
    const message = payload?.message;
    return sendJson({ ...payload, success: true, data: payload, ...(message ? { message } : {}) });
  };

  next();
}
