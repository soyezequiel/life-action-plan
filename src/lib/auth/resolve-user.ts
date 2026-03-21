import { DEFAULT_USER_ID } from './user-settings'

export const LAP_USER_ID_HEADER = 'x-lap-user-id'
export const LAP_AUTHENTICATED_HEADER = 'x-lap-authenticated'

interface RequestLike {
  headers: Headers
}

export function resolveAuthenticatedUserId(request: RequestLike): string | null {
  const authenticated = request.headers.get(LAP_AUTHENTICATED_HEADER) === '1'
  const userId = request.headers.get(LAP_USER_ID_HEADER)?.trim() || ''

  if (!authenticated || !userId) {
    return null
  }

  return userId
}

export function resolveUserId(request: RequestLike): string {
  return resolveAuthenticatedUserId(request) ?? DEFAULT_USER_ID
}
