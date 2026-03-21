import argon2 from 'argon2'
import bcrypt from 'bcryptjs'

const ARGON2_MEMORY_COST = 64 * 1024
const ARGON2_TIME_COST = 3
const ARGON2_PARALLELISM = 1

function isBcryptHash(hash: string): boolean {
  return hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')
}

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: ARGON2_MEMORY_COST,
    timeCost: ARGON2_TIME_COST,
    parallelism: ARGON2_PARALLELISM
  })
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  const normalizedHash = hash.trim()

  if (!normalizedHash) {
    return false
  }

  if (normalizedHash.startsWith('$argon2id$')) {
    return argon2.verify(normalizedHash, plain)
  }

  if (isBcryptHash(normalizedHash)) {
    return bcrypt.compare(plain, normalizedHash)
  }

  return false
}
