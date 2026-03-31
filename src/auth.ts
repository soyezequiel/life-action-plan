import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"
import Credentials from "next-auth/providers/credentials"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { getDatabase } from "@/src/lib/db/connection"
import { verify } from "argon2"
import { z } from "zod"
import { authConfig } from "./auth.config"

import type { NextAuthConfig } from "next-auth"

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const parsedCredentials = z
        .object({ email: z.string().email(), password: z.string().min(6) })
        .safeParse(credentials)

      if (!parsedCredentials.success) {
        return null
      }

      const { email, password } = parsedCredentials.data
      const db = getDatabase()
      const user = await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.email, email),
      })

      if (!user || !user.passwordHash) return null

      const passwordsMatch = await verify(user.passwordHash, password)
      if (passwordsMatch) {
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        }
      }

      return null
    },
  }),
]

if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(GitHub)
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(getDatabase()),
  providers,
})

