import NextAuth from "next-auth"
import { authConfig } from "./src/auth.config"
import { NextResponse } from "next/server"
import {
  LAP_USER_ID_HEADER,
  LAP_AUTHENTICATED_HEADER
} from "./src/lib/auth/resolve-user"

const { auth } = NextAuth(authConfig)

const PUBLIC_ROUTES = ["/auth/signin", "/auth/signup", "/api/auth"]

export default auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth
  const isPublicRoute = PUBLIC_ROUTES.some(route => nextUrl.pathname.startsWith(route))

  // Redirect to sign-in if not logged in and accessing a protected route
  // The root path '/' is not public, so it will be redirected
  if (!isLoggedIn && !isPublicRoute) {
    const signInUrl = new URL("/auth/signin", nextUrl)
    signInUrl.searchParams.set("callbackUrl", nextUrl.pathname)
    return NextResponse.redirect(signInUrl)
  }

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
     * - _next/* (internal Next.js assets and dev endpoints)
     * - favicon.ico (favicon file)
     * - public files (images in public/)
     */
    "/((?!_next/|favicon.ico|public/).*)",
  ],
}
