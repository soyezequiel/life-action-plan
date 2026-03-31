import NextAuth from "next-auth"
import { authConfig } from "./src/auth.config"
import { NextResponse } from "next/server"
import {
  LAP_USER_ID_HEADER,
  LAP_AUTHENTICATED_HEADER
} from "./src/lib/auth/resolve-user"

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const nextHeaders = new Headers(req.headers)
  
  // Inject headers for downward compatibility with sync resolveUserId
  if (req.auth?.user?.id) {
    nextHeaders.set(LAP_USER_ID_HEADER, req.auth.user.id)
    nextHeaders.set(LAP_AUTHENTICATED_HEADER, "1")
  }

  return NextResponse.next({
    request: {
      headers: nextHeaders
    }
  })
})

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images in public/)
     */
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
}
