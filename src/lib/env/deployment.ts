export type DeploymentMode = 'local' | 'vercel-preview' | 'vercel-production'

function normalizeEnvValue(value: string | undefined): string {
  return value?.trim().toLowerCase() || ''
}

export function getDeploymentMode(env: NodeJS.ProcessEnv = process.env): DeploymentMode {
  const vercelEnv = normalizeEnvValue(env.VERCEL_ENV)

  if (vercelEnv === 'production') {
    return 'vercel-production'
  }

  if (vercelEnv === 'preview') {
    return 'vercel-preview'
  }

  if (normalizeEnvValue(env.VERCEL) === '1') {
    return 'vercel-preview'
  }

  return 'local'
}

export function isCloudDeployment(mode: DeploymentMode = getDeploymentMode()): boolean {
  return mode !== 'local'
}
