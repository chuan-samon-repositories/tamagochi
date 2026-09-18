// Every failure reaches the UI in one shape, whichever adapter produced it.
// `code` is the stable one from the contract (bad_request, doc_too_large,
// already_studying, upstream_failed); `offline` is ours, for the request that
// never reached a server at all.
export class ApiError extends Error {
  constructor(code, message, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}
