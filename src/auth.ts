import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { getDatabase } from "@/src/lib/db/connection"
import { verify } from "argon2"
import { z } from "zod"
import { authConfig } from "./auth.config"

import type { NextAuthConfig } from "next-auth"

class UserNotFoundError extends CredentialsSignin {
  code = "user_not_found"
}

class InvalidPasswordError extends CredentialsSignin {
  code = "invalid_password"
}

class InvalidInputError extends CredentialsSignin {
  code = "invalid_input"
}

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
        throw new InvalidInputError()
      }

      const { email, password } = parsedCredentials.data
      const db = getDatabase()
      const user = await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.email, email),
      })

      if (!user) {
        throw new UserNotFoundError()
      }

      if (!user.passwordHash) {
        // Handle cases where user might not have a password (e.g. social only)
        throw new InvalidPasswordError()
      }

      const passwordsMatch = await verify(user.passwordHash, password)
      if (passwordsMatch) {
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        }
      }

      throw new InvalidPasswordError()
    },
  }),
]

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
})
