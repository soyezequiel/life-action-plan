'use client'

interface VaultBackupResponse {
  success: boolean
  backup: {
    encryptedBlob: string
    salt: string
    updatedAt?: string
  } | null
}

async function readResponseText(response: Response): Promise<string> {
  return response.text()
}

export async function uploadVaultBackup(encryptedBlob: string, salt: string): Promise<VaultBackupResponse> {
  const response = await fetch('/api/vault/backup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ encryptedBlob, salt })
  })

  if (!response.ok) {
    throw new Error(await readResponseText(response))
  }

  return response.json() as Promise<VaultBackupResponse>
}

export async function downloadVaultBackup(): Promise<VaultBackupResponse['backup']> {
  const response = await fetch('/api/vault/backup')

  if (!response.ok) {
    throw new Error(await readResponseText(response))
  }

  const payload = await response.json() as VaultBackupResponse
  return payload.backup
}
