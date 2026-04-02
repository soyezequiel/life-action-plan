import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { startPlanBuild } from '../src/lib/client/plan-client'
import { t } from '../src/i18n'

function createSseEvent(payload: unknown, eventType?: string): string {
  const lines: string[] = []

  if (eventType) {
    lines.push(`event: ${eventType}`)
  }

  lines.push(`data: ${JSON.stringify(payload)}`)

  return `${lines.join('\n')}\n\n`
}

function createSseResponse(events: string[]): Response {
  return new Response(events.join(''), {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream'
    }
  })
}

describe('plan-client stream handling', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('reporta la ultima fase conocida cuando el stream termina sin evento final', async () => {
    const fetchMock = vi.fn(async () => createSseResponse([
      createSseEvent({
        type: 'v6:phase',
        data: {
          phase: 'quality_review',
          iteration: 2,
        },
      }, 'v6:phase'),
      createSseEvent({
        type: 'v6:progress',
        data: {
          score: 78,
          lastAction: 'Validando consistencia final',
        },
      }, 'v6:progress'),
      createSseEvent({
        type: 'v6:debug',
        data: {
          currentPhase: 'quality_review',
          summary_es: 'Validando consistencia final',
          progressScore: 78,
          iteration: 2,
        },
      }, 'v6:debug'),
    ]))

    vi.stubGlobal('fetch', fetchMock)

    const onError = vi.fn()

    await startPlanBuild('Aprender piano', 'profile-1', 'codex', {
      onPhase: vi.fn(),
      onProgress: vi.fn(),
      onNeedsInput: vi.fn(),
      onComplete: vi.fn(),
      onError,
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/plan/build', expect.objectContaining({
      method: 'POST',
    }))
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(
      t('errors.plan_stream_interrupted'),
      expect.objectContaining({
        structured: expect.objectContaining({
          code: 'stream_interrupted',
          state: 'quality_review',
          score: 78,
        }),
        raw: expect.objectContaining({
          interruption: 'unexpected_stream_end',
          lastKnownPhase: 'quality_review',
          lastKnownIteration: 2,
          lastKnownAction: 'Validando consistencia final',
          lastKnownScore: 78,
        }),
      })
    )
  })

  it('propaga el payload de diagnostico cuando el servidor bloquea el build', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => createSseResponse([
      createSseEvent({
        type: 'v6:blocked',
        data: {
          message: 'Build bloqueado por calidad.',
          debug: {
            code: 'quality_blocked',
            state: 'quality_review',
            score: 61,
          },
          failureCode: 'quality_blocked',
          degraded: false,
          qualityIssues: ['overlap_detected'],
        },
      }, 'v6:blocked'),
    ])))

    const onError = vi.fn()

    await startPlanBuild('Aprender piano', 'profile-1', 'codex', {
      onPhase: vi.fn(),
      onProgress: vi.fn(),
      onNeedsInput: vi.fn(),
      onComplete: vi.fn(),
      onError,
    })

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(
      'Build bloqueado por calidad.',
      expect.objectContaining({
        structured: expect.objectContaining({
          code: 'quality_blocked',
          state: 'quality_review',
          score: 61,
        }),
        raw: expect.objectContaining({
          failureCode: 'quality_blocked',
          degraded: false,
          qualityIssues: ['overlap_detected'],
        }),
      })
    )
  })

  it('envia startDate cuando se define un inicio explicito', async () => {
    const fetchMock = vi.fn(async () => createSseResponse([
      createSseEvent({
        type: 'v6:complete',
        data: {
          planId: 'plan-1',
          score: 91,
          iterations: 4,
        },
      }, 'v6:complete'),
    ]))

    vi.stubGlobal('fetch', fetchMock)

    await startPlanBuild('Aprender piano', 'profile-1', 'codex', {
      onPhase: vi.fn(),
      onProgress: vi.fn(),
      onNeedsInput: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    }, '2026-04-10')

    expect(fetchMock).toHaveBeenCalledWith('/api/plan/build', expect.objectContaining({
      method: 'POST',
    }))

    const requestInit = fetchMock.mock.calls[0]?.[1]
    expect(JSON.parse(String(requestInit?.body))).toEqual(expect.objectContaining({
      goalText: 'Aprender piano',
      profileId: 'profile-1',
      resourceMode: 'codex',
      debug: true,
      startDate: '2026-04-10',
    }))
  })
})
