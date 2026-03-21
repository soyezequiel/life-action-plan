import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('browserHttpLapClient', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('consume el stream SSE de build y emite progreso incremental', async () => {
    const fetchMock = vi.fn(async () => new Response([
      'data: {"type":"progress","progress":{"profileId":"profile-1","provider":"openai:gpt-4o-mini","stage":"preparing","current":1,"total":4,"charCount":0}}\n\n',
      'data: {"type":"progress","progress":{"profileId":"profile-1","provider":"openai:gpt-4o-mini","stage":"generating","current":2,"total":4,"charCount":12,"chunk":"hola mundo"}}\n\n',
      'data: {"type":"result","result":{"success":true,"planId":"plan-1","nombre":"Plan demo","resumen":"Resumen","eventos":[],"tokensUsed":{"input":10,"output":20},"fallbackUsed":false}}\n\n'
    ].join(''), {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream'
      }
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { browserLapClient } = await import('../src/lib/client/browser-http-client')
    const progressEvents: string[] = []
    const unsubscribe = browserLapClient.plan.onBuildProgress((progress) => {
      progressEvents.push(`${progress.current}:${progress.stage}:${progress.charCount}`)
    })

    const result = await browserLapClient.plan.build('profile-1', '', 'openai:gpt-4o-mini')

    expect(fetchMock).toHaveBeenCalledWith('/api/plan/build', expect.objectContaining({
      method: 'POST'
    }))
    expect(progressEvents).toEqual([
      '1:preparing:0',
      '1:preparing:0',
      '2:generating:12'
    ])
    expect(result).toMatchObject({
      success: true,
      planId: 'plan-1',
      nombre: 'Plan demo'
    })

    unsubscribe()
  })

  it('consume el stream SSE de simulacion y emite progreso por etapas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response([
      'data: {"type":"progress","progress":{"planId":"plan-1","mode":"interactive","stage":"schedule","current":1,"total":4}}\n\n',
      'data: {"type":"progress","progress":{"planId":"plan-1","mode":"interactive","stage":"summary","current":4,"total":4}}\n\n',
      'data: {"type":"result","result":{"success":true,"simulation":{"ranAt":"2026-03-20T00:00:00.000Z","mode":"interactive","periodLabel":"marzo 2026","summary":{"overallStatus":"PASS","pass":1,"warn":0,"fail":0,"missing":0},"findings":[]}}}\n\n'
    ].join(''), {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream'
      }
    })))

    const { browserLapClient } = await import('../src/lib/client/browser-http-client')
    const progressEvents: string[] = []
    const unsubscribe = browserLapClient.plan.onSimulationProgress((progress) => {
      progressEvents.push(`${progress.current}:${progress.stage}`)
    })

    const result = await browserLapClient.plan.simulate('plan-1', 'interactive')

    expect(progressEvents).toEqual([
      '1:schedule',
      '1:schedule',
      '4:summary'
    ])
    expect(result).toMatchObject({
      success: true,
      simulation: {
        summary: {
          overallStatus: 'PASS'
        }
      }
    })

    unsubscribe()
  })

  it('propaga errores HTTP de la API en vez de ocultarlos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom'
    }))

    const { browserLapClient } = await import('../src/lib/client/browser-http-client')

    await expect(browserLapClient.profile.latest()).rejects.toThrow('boom')
  })

  it('pide todas las actividades del plan cuando no se pasa fecha', async () => {
    const fetchMock = vi.fn(async () => new Response('[]', {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { browserLapClient } = await import('../src/lib/client/browser-http-client')

    const rows = await browserLapClient.progress.list('plan-1')

    expect(fetchMock).toHaveBeenCalledWith('/api/progress/list?planId=plan-1', expect.anything())
    expect(rows).toEqual([])
  })
})
