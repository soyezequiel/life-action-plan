import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import {
  LAP_AUTHENTICATED_HEADER,
  LAP_USER_ID_HEADER
} from './src/lib/auth/resolve-user'
import {
  readSessionTokenFromRequest,
  SESSION_COOKIE_NAME,
  verifySessionToken
} from './src/lib/auth/session-token'

const PUBLIC_API_PATHS = new Set([
  '/api/auth/register',
  '/api/auth/login'
])

export async function middleware(request: NextRequest): Promise<NextResponse> {
  if (PUBLIC_API_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next()
  }

  const nextHeaders = new Headers(request.headers)
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? readSessionTokenFromRequest(request)

  nextHeaders.delete(LAP_USER_ID_HEADER)
  nextHeaders.delete(LAP_AUTHENTICATED_HEADER)

  if (token) {
    const session = await verifySessionToken(token)

    if (session?.userId) {
      nextHeaders.set(LAP_USER_ID_HEADER, session.userId)
      nextHeaders.set(LAP_AUTHENTICATED_HEADER, '1')
    }
  }

  return NextResponse.next({
    request: {
      headers: nextHeaders
    }
  })
}

export const config = {
  matcher: ['/api/:path*']
}
