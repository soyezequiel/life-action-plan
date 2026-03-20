import { describe, expect, it } from 'vitest'
import { canUseLocalOllama, getDeploymentMode, isCloudDeployment } from '../src/lib/env/deployment'

describe('deployment mode', () => {
  it('trata el entorno sin variables de Vercel como local', () => {
    expect(getDeploymentMode({} as NodeJS.ProcessEnv)).toBe('local')
    expect(canUseLocalOllama('local')).toBe(true)
    expect(isCloudDeployment('local')).toBe(false)
  })

  it('detecta preview de Vercel', () => {
    const mode = getDeploymentMode({ VERCEL: '1', VERCEL_ENV: 'preview' } as unknown as NodeJS.ProcessEnv)

    expect(mode).toBe('vercel-preview')
    expect(canUseLocalOllama(mode)).toBe(false)
    expect(isCloudDeployment(mode)).toBe(true)
  })

  it('detecta produccion de Vercel', () => {
    const mode = getDeploymentMode({ VERCEL_ENV: 'production' } as unknown as NodeJS.ProcessEnv)

    expect(mode).toBe('vercel-production')
    expect(canUseLocalOllama(mode)).toBe(false)
    expect(isCloudDeployment(mode)).toBe(true)
  })
})
