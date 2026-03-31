import type { NextAuthConfig } from "next-auth"

export const authConfig = {
  providers: [
    // We leave this empty for the Edge runtime (middleware)
    // Real providers are added in auth.ts (server-only)
  ],
  pages: {
    signIn: "/auth/signin",
  },
  session: {
    strategy: "jwt"
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    session({ session, token }) {
      if (token?.id) {
        session.user.id = token.id as string
      }
      return session
    },
  },
} satisfies NextAuthConfig
