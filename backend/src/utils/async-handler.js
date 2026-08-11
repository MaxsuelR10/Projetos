export function asyncHandler(handler) {
  return function handledRequest(request, response, next) {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}
