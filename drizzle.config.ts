import { existsSync } from 'node:fs'
import type { Config } from 'drizzle-kit'

for (const envFile of ['.env.local', '.env']) {
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile)
  }
}

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? ''
  }
} satisfies Config
