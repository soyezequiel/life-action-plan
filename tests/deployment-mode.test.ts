import { describe, expect, it } from 'vitest'
import { getDeploymentMode, isCloudDeployment } from '../src/lib/env/deployment'

describe('deployment mode', () => {
  it('trata el entorno sin variables de Vercel como local', () => {
    expect(getDeploymentMode({} as NodeJS.ProcessEnv)).toBe('local')
    expect(isCloudDeployment('local')).toBe(false)
  })

  it('detecta preview de Vercel', () => {
    const mode = getDeploymentMode({ VERCEL: '1', VERCEL_ENV: 'preview' } as unknown as NodeJS.ProcessEnv)

    expect(mode).toBe('vercel-preview')
    expect(isCloudDeployment(mode)).toBe(true)
  })

  it('detecta produccion de Vercel', () => {
    const mode = getDeploymentMode({ VERCEL_ENV: 'production' } as unknown as NodeJS.ProcessEnv)

    expect(mode).toBe('vercel-production')
    expect(isCloudDeployment(mode)).toBe(true)
  })
})
