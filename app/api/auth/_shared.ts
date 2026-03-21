import { toConfigErrorMessage } from '../../../src/shared/config-errors'
import { jsonResponse } from '../_shared'

export function toAuthConfigErrorResponse(error: unknown): Response | null {
  const message = error instanceof Error ? error.message : String(error)
  const configError = toConfigErrorMessage(message)

  if (!configError) {
    return null
  }

  return jsonResponse({
    authenticated: false,
    error: configError
  }, { status: 503 })
}

export function toAuthRateLimitedResponse(retryAfterSeconds: number): Response {
  const response = jsonResponse({
    authenticated: false,
    error: 'AUTH_RATE_LIMITED'
  }, { status: 429 })

  response.headers.set('Retry-After', String(retryAfterSeconds))
  return response
}
