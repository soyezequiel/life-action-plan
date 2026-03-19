import { beforeEach, describe, expect, it, vi } from 'vitest'

class FakeEventSource {
  static instances: FakeEventSource[] = []

  url: string
  onopen: (() => void) | null = null
  onmessage: ((message: { data: string }) => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  close(): void {
    // No-op for tests.
  }
}

describe('browserHttpLapClient', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    FakeEventSource.instances = []
  })

  it('opens the debug event stream even after a previous availability fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    vi.stubGlobal('EventSource', FakeEventSource)

    const { browserHttpLapClient } = await import('../src/renderer/src/lib/browser-http-client')

    await expect(browserHttpLapClient.profile.latest()).resolves.toBe('mock-profile-1')

    const unsubscribe = browserHttpLapClient.debug.onEvent(() => {})

    expect(FakeEventSource.instances).toHaveLength(1)
    expect(FakeEventSource.instances[0]?.url).toBe('/__lap/api/debug/events')

    unsubscribe()
  })

  it('opens the build progress stream when a listener subscribes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => null
    }))
    vi.stubGlobal('EventSource', FakeEventSource)

    const { browserHttpLapClient } = await import('../src/renderer/src/lib/browser-http-client')

    const unsubscribe = browserHttpLapClient.plan.onBuildProgress(() => {})

    expect(FakeEventSource.instances).toHaveLength(1)
    expect(FakeEventSource.instances[0]?.url).toBe('/__lap/api/plan/build/events')

    unsubscribe()
  })

  it('prewarms the debug event stream when the inspector is enabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ enabled: true, panelVisible: true })
    }))
    vi.stubGlobal('EventSource', FakeEventSource)

    const { browserHttpLapClient } = await import('../src/renderer/src/lib/browser-http-client')

    await expect(browserHttpLapClient.debug.enable()).resolves.toEqual({
      enabled: true,
      panelVisible: true
    })

    expect(FakeEventSource.instances).toHaveLength(1)
    expect(FakeEventSource.instances[0]?.url).toBe('/__lap/api/debug/events')
  })

  it('surfaces dev-api http errors instead of silently falling back to placeholders', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom'
    }))
    vi.stubGlobal('EventSource', FakeEventSource)

    const { browserHttpLapClient } = await import('../src/renderer/src/lib/browser-http-client')

    await expect(browserHttpLapClient.profile.latest()).rejects.toThrow('boom')
  })
})
