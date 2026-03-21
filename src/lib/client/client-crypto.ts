'use client'

const PBKDF2_ITERATIONS = 600_000
const AES_KEY_LENGTH = 256
const SALT_LENGTH = 16
const IV_LENGTH = 12

function ensureWebCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error('WEB_CRYPTO_UNAVAILABLE')
  }

  return globalThis.crypto
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

export async function deriveKeyFromPassword(password: string, salt: string): Promise<CryptoKey> {
  const webCrypto = ensureWebCrypto()
  const keyMaterial = await webCrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )

  return webCrypto.subtle.deriveKey({
    name: 'PBKDF2',
    salt: base64ToArrayBuffer(salt),
    iterations: PBKDF2_ITERATIONS,
    hash: 'SHA-256'
  }, keyMaterial, {
    name: 'AES-GCM',
    length: AES_KEY_LENGTH
  }, false, ['encrypt', 'decrypt'])
}

export async function encryptBlob(plaintext: string, key: CryptoKey): Promise<{ iv: string; ciphertext: string }> {
  const webCrypto = ensureWebCrypto()
  const iv = webCrypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encrypted = await webCrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  )

  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted))
  }
}

export async function decryptBlob(iv: string, ciphertext: string, key: CryptoKey): Promise<string> {
  const webCrypto = ensureWebCrypto()
  const decrypted = await webCrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(iv) },
    key,
    base64ToArrayBuffer(ciphertext)
  )

  return new TextDecoder().decode(decrypted)
}

export function generateSalt(): string {
  const webCrypto = ensureWebCrypto()
  return bytesToBase64(webCrypto.getRandomValues(new Uint8Array(SALT_LENGTH)))
}
