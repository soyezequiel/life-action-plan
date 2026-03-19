import { describe, expect, it } from 'vitest'
import type { LapAPI, LapWindow } from '../src/shared/types/lap-api'
import { browserHttpLapClient } from '../src/renderer/src/lib/browser-http-client'
import { createDefaultAppServices, resolveLapClient } from '../src/renderer/src/lib/lap-client'

describe('app services', () => {
  it('uses the browser client when no electron window is available', () => {
    expect(resolveLapClient(null)).toBe(browserHttpLapClient)
  })

  it('uses the injected electron client when preload api is present', () => {
    const stubClient = {} as LapAPI
    const stubWindow = {
      electron: {} as LapWindow['electron'],
      api: stubClient
    } as LapWindow

    expect(resolveLapClient(stubWindow)).toBe(stubClient)
    expect(createDefaultAppServices(stubWindow).lapClient).toBe(stubClient)
  })
})
