import http from 'node:http'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

type RecordedRequest = {
  method: string
  url: string
  body: string
}

let server: http.Server | null = null
let baseUrl = ''
let requests: RecordedRequest[] = []

const repoRoot = process.cwd()
const runPlanScript = path.join(repoRoot, 'scripts', 'run-plan.mjs')

function createSseResponseBody() {
  const payload = {
    type: 'result',
    result: {
      success: false,
      error: 'No publicamos este plan porque la revision critica fallo y requiere regeneracion.',
      failureCode: 'failed_for_quality_review',
      publicationState: 'failed',
      degraded: false,
      agentOutcomes: [
        {
          agent: 'critic',
          phase: 'critique',
          source: 'fallback',
          errorCode: 'FAILED_QUALITY_REVIEW',
          errorMessage: 'Faltan hitos concretos para cerrar el plan.',
          durationMs: 12,
        },
      ],
      blockingAgents: [
        {
          agent: 'critic',
          phase: 'critique',
          source: 'fallback',
          errorCode: 'FAILED_QUALITY_REVIEW',
          errorMessage: 'Faltan hitos concretos para cerrar el plan.',
          durationMs: 12,
        },
      ],
      package: {
        qualityIssues: [
          {
            code: 'FAILED_QUALITY_REVIEW',
            severity: 'blocking',
            message: 'Faltan hitos concretos para cerrar el plan.',
          },
        ],
        warnings: [
          'Faltan hitos concretos para cerrar el plan.',
        ],
      },
    },
  }

  return [
    'event: v6:blocked',
    `data: ${JSON.stringify({
      type: 'v6:blocked',
      data: payload.result,
    })}`,
    '',
    'event: result',
    `data: ${JSON.stringify(payload)}`,
    '',
  ].join('\n') + '\n'
}

function createNeedsInputResponseBody() {
  return [
    'event: v6:phase',
    `data: ${JSON.stringify({
      type: 'v6:phase',
      data: { phase: 'interpret', iteration: 0 },
    })}`,
    '',
    'event: v6:needs_input',
    `data: ${JSON.stringify({
      type: 'v6:needs_input',
      data: {
        sessionId: 'session-test-123',
        questions: {
          questions: [
            { id: 'nivel-culinario', text: '¿Cuál es tu nivel?', type: 'text' },
            { id: 'subtema-italiano', text: '¿Qué platos?', type: 'text' },
          ],
        },
      },
    })}`,
    '',
  ].join('\n') + '\n'
}

function createCompleteResponseBody({
  planId = 'plan-complete-123',
  score = 95,
  iterations = 2,
  degraded = false,
  agentOutcomes = [],
} = {}) {
  return [
    'event: v6:complete',
    `data: ${JSON.stringify({
      type: 'v6:complete',
      data: {
        planId,
        score,
        iterations,
        degraded,
        agentOutcomes,
      },
    })}`,
    '',
  ].join('\n') + '\n'
}

function createUsageLimitBlockedResponseBody() {
  const payload = {
    type: 'result',
    result: {
      success: false,
      error: 'No publicamos este plan porque la revision critica fallo y requiere regeneracion.',
      failureCode: 'requires_regeneration',
      publicationState: 'blocked',
      degraded: true,
      agentOutcomes: [
        {
          agent: 'critic',
          phase: 'critique',
          source: 'fallback',
          errorCode: 'RetryError',
          errorMessage: 'Failed after 3 attempts. Last error: The usage limit has been reached',
          durationMs: 12,
        },
      ],
      blockingAgents: [
        {
          agent: 'critic',
          phase: 'critique',
          source: 'fallback',
          errorCode: 'RetryError',
          errorMessage: 'Failed after 3 attempts. Last error: The usage limit has been reached',
          durationMs: 12,
        },
      ],
      package: {
        qualityIssues: [
          {
            code: 'CRITICAL_AGENT_FAILURE',
            severity: 'blocking',
            message: 'La ruta critica del pipeline fallo y hace falta regenerarlo con un proveedor que responda bien.',
          },
        ],
        warnings: [
          'No se puede publicar este plan: la revision critica fallo y hace falta regenerarlo con un proveedor que responda bien.',
        ],
      },
    },
  }

  return [
    'event: v6:blocked',
    `data: ${JSON.stringify({
      type: 'v6:blocked',
      data: payload.result,
    })}`,
    '',
    'event: result',
    `data: ${JSON.stringify(payload)}`,
    '',
  ].join('\n') + '\n'
}

function createDebugCompleteResponseBody() {
  return [
    'event: v6:debug',
    `data: ${JSON.stringify({
      type: 'v6:debug',
      data: {
        sequence: 1,
        timestamp: '2026-03-30T00:00:00.000Z',
        category: 'lifecycle',
        action: 'run.started',
        summary_es: 'Inicio de corrida para el objetivo.',
        phase: 'interpret',
        agent: 'goal-interpreter',
        iteration: 0,
        revisionCycle: 0,
        clarifyRound: 0,
        progressScore: 0,
        degraded: false,
        fallbackCount: 0,
        publicationState: null,
        failureCode: null,
        errorCode: null,
        details: {
          runtimeLabel: 'openai:gpt-5-codex',
        },
      },
    })}`,
    '',
    'event: v6:debug',
    `data: ${JSON.stringify({
      type: 'v6:debug',
      data: {
        sequence: 2,
        timestamp: '2026-03-30T00:00:03.000Z',
        category: 'phase',
        action: 'interpret.summary',
        summary_es: 'Objetivo interpretado como INCOME_GOAL con confianza 82%.',
        phase: 'interpret',
        agent: 'goal-interpreter',
        iteration: 0,
        revisionCycle: 0,
        clarifyRound: 0,
        progressScore: 10,
        degraded: false,
        fallbackCount: 0,
        publicationState: null,
        failureCode: null,
        errorCode: null,
        details: {
          partialKind: 'interpretation',
          normalizedGoal: 'Lograr un flujo mensual de 3k USD desde Argentina en 12 meses via empleo remoto.',
          goalType: 'INCOME_GOAL',
          suggestedDomain: 'career',
          ambiguities: ['seniority real para salir al mercado'],
          assumptions: ['se prioriza empleo remoto'],
        },
      },
    })}`,
    '',
    'event: v6:debug',
    `data: ${JSON.stringify({
      type: 'v6:debug',
      data: {
        sequence: 3,
        timestamp: '2026-03-30T00:00:12.000Z',
        category: 'phase',
        action: 'plan.summary',
        summary_es: 'Roadmap generado con 3 fase(s) y 3 hito(s).',
        phase: 'plan',
        agent: 'planner',
        iteration: 4,
        revisionCycle: 0,
        clarifyRound: 2,
        progressScore: 48,
        degraded: false,
        fallbackCount: 0,
        publicationState: null,
        failureCode: null,
        errorCode: null,
        details: {
          partialKind: 'roadmap',
          horizonWeeks: 52,
          phaseCount: 3,
          phases: [
            { index: 1, title: 'Base tecnica', focus: 'Cerrar huecos de portfolio y entrevistas', durationWeeks: 12 },
            { index: 2, title: 'Insercion remota', focus: 'Aplicar con ritmo sostenido y feedback', durationWeeks: 20 },
            { index: 3, title: 'Escalada a meta', focus: 'Negociar rango y consolidar ingresos', durationWeeks: 20 },
          ],
          milestones: ['Portfolio visible', 'Primeras entrevistas', 'Oferta remota'],
          fallbackUsed: false,
        },
      },
    })}`,
    '',
    'event: v6:heartbeat',
    `data: ${JSON.stringify({
      type: 'v6:heartbeat',
      data: {
        timestamp: '2026-03-30T00:00:10.000Z',
        status: {
          lifecycle: 'running',
          currentPhase: 'plan',
          currentAgent: 'planner',
          currentAction: 'agent.start',
          currentSummary_es: 'Planificando estrategia.',
          iteration: 3,
          revisionCycles: 1,
          clarifyRounds: 0,
          progressScore: 55,
          degraded: false,
          fallbackCount: 0,
          publicationState: null,
          failureCode: null,
          lastEventSequence: 1,
          lastEventTimestamp: '2026-03-30T00:00:00.000Z',
          lastEventSummary_es: 'Inicio de corrida para el objetivo.',
        },
      },
    })}`,
    '',
    'event: v6:debug',
    `data: ${JSON.stringify({
      type: 'v6:debug',
      data: {
        sequence: 4,
        timestamp: '2026-03-30T00:00:18.000Z',
        category: 'phase',
        action: 'check.summary',
        summary_es: 'Factibilidad tight: 14h disponibles vs 16h requeridas.',
        phase: 'check',
        agent: 'feasibility-checker',
        iteration: 5,
        revisionCycle: 0,
        clarifyRound: 2,
        progressScore: 60,
        degraded: false,
        fallbackCount: 0,
        publicationState: null,
        failureCode: null,
        errorCode: null,
        details: {
          partialKind: 'feasibility',
          status: 'tight',
          availableHours: 14,
          requiredHours: 16,
          gap: -2,
          adjustments: [
            { description: 'Reducir aplicaciones manuales y automatizar shortlist' },
          ],
        },
      },
    })}`,
    '',
    'event: v6:debug',
    `data: ${JSON.stringify({
      type: 'v6:debug',
      data: {
        sequence: 5,
        timestamp: '2026-03-30T00:00:24.000Z',
        category: 'phase',
        action: 'schedule.summary',
        summary_es: 'Calendarizacion optimal con fill rate 84%.',
        phase: 'schedule',
        agent: 'scheduler',
        iteration: 6,
        revisionCycle: 0,
        clarifyRound: 2,
        progressScore: 72,
        degraded: false,
        fallbackCount: 0,
        publicationState: null,
        failureCode: null,
        errorCode: null,
        details: {
          partialKind: 'schedule',
          fillRate: 0.84,
          solverStatus: 'optimal',
          solverTimeMs: 21,
          unscheduledCount: 2,
          tradeoffs: [
            { question_esAR: 'Mover practica avanzada al fin de semana para liberar dias habiles?' },
          ],
        },
      },
    })}`,
    '',
    'event: v6:debug',
    `data: ${JSON.stringify({
      type: 'v6:debug',
      data: {
        sequence: 6,
        timestamp: '2026-03-30T00:00:31.000Z',
        category: 'critic',
        action: 'critic.report',
        summary_es: 'El critico cerro la vuelta con verdict revise y score 78/100.',
        phase: 'critique',
        agent: 'critic',
        iteration: 7,
        revisionCycle: 1,
        clarifyRound: 2,
        progressScore: 84,
        degraded: false,
        fallbackCount: 0,
        publicationState: null,
        failureCode: null,
        errorCode: null,
        details: {
          partialKind: 'critic_round',
          verdict: 'revise',
          overallScore: 78,
          comparison: 'mejor',
          scoreDelta: 12,
          mustFix: [
            { message: 'Falta explicitar la transicion de junior a primer empleo remoto.' },
          ],
        },
      },
    })}`,
    '',
    'event: v6:debug',
    `data: ${JSON.stringify({
      type: 'v6:debug',
      data: {
        sequence: 7,
        timestamp: '2026-03-30T00:00:40.000Z',
        category: 'publication',
        action: 'publication.evaluated',
        summary_es: 'La publicacion quedo habilitada.',
        phase: 'done',
        agent: 'packager',
        iteration: 8,
        revisionCycle: 1,
        clarifyRound: 2,
        progressScore: 100,
        degraded: false,
        fallbackCount: 0,
        publicationState: 'ready',
        failureCode: null,
        errorCode: null,
        details: {
          partialKind: 'publication',
          canPublish: true,
          fallbackLedger: [],
          exactBlockers: [],
          misalignedGoal: false,
          qualityIssues: [],
          warnings: [],
        },
      },
    })}`,
    '',
    'event: v6:complete',
    `data: ${JSON.stringify({
      type: 'v6:complete',
      data: {
        planId: 'plan-debug-123',
        score: 92,
        iterations: 4,
        degraded: false,
        agentOutcomes: [],
      },
    })}`,
    '',
  ].join('\n') + '\n'
}

async function startServer() {
  requests = []
  server = http.createServer((req, res) => {
    const method = req.method ?? 'GET'
    const url = req.url ?? '/'
    const chunks: Buffer[] = []

    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    req.on('end', () => {
      requests.push({
        method,
        url,
        body: Buffer.concat(chunks).toString('utf8'),
      })

      const parsedUrl = new URL(`http://127.0.0.1${url}`)

      if (method === 'POST' && parsedUrl.pathname === '/api/plan/build') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        })
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
        if (payload.goalText === 'Objetivo con usage limit') {
          if (payload.resourceMode === 'codex') {
            res.end(createUsageLimitBlockedResponseBody())
            return
          }
        }
        if (payload.goalText === 'Objetivo debug completo') {
          res.end(createDebugCompleteResponseBody())
          return
        }
        if (payload.goalText === 'Objetivo con respuestas predefinidas') {
          res.end(createNeedsInputResponseBody())
          return
        }
        res.end(createSseResponseBody())
        return
      }

      if (method === 'POST' && parsedUrl.pathname === '/api/plan/build/resume') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        })
        res.end(createCompleteResponseBody())
        return
      }

      if (parsedUrl.pathname === '/api/plan/package') {
        if (parsedUrl.searchParams.get('planId') === 'plan-debug-123') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            ok: true,
            data: {
              items: [],
              plan: {
                title: 'Plan debug',
                description: 'Plan generado en modo debug',
                publicationState: 'publishable',
                skeleton: { phases: [], milestones: [] },
                detail: { weeks: [], scheduledEvents: [] },
              },
              degraded: false,
              publicationState: 'publishable',
              agentOutcomes: [],
            },
            meta: { modelId: 'openai:gpt-5-codex' },
          }))
          return
        }
        if (parsedUrl.searchParams.get('planId') === 'plan-complete-123') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            ok: true,
            data: {
              items: [],
              plan: {
                title: 'Plan con respuestas',
                description: 'Plan generado',
                skeleton: { phases: [], milestones: [] },
                detail: { weeks: [], scheduledEvents: [] },
              },
              degraded: false,
              agentOutcomes: [],
            },
            meta: { modelId: 'openai:gpt-5-codex' },
          }))
          return
        }
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'package endpoint should not be called on failure' }))
        return
      }

      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'not found' }))
    })
  })

  await new Promise<void>((resolve) => {
    server?.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind test server')
  }

  baseUrl = `http://127.0.0.1:${address.port}`
}

async function stopServer() {
  if (!server) return
  await new Promise<void>((resolve) => {
    server?.close(() => resolve())
  })
  server = null
  baseUrl = ''
}

describe('run-plan CLI failure surfacing', () => {
  beforeEach(async () => {
    await startServer()
  })

  afterEach(async () => {
    await stopServer()
  })

  it('prints structured failure details when the V6 pipeline rejects publication', async () => {
    const result = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [
        runPlanScript,
        'Quiero aprender a cocinar platos italianos',
        '--profile=c2567794-35f8-45b0-8eea-f0b1b7a86f60',
        '--provider=codex',
        `--base=${baseUrl}`,
        '--detail-weeks=6',
      ], {
        cwd: repoRoot,
        env: {
          ...process.env,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })

      let stdout = ''
      let stderr = ''

      child.stdout?.setEncoding('utf8')
      child.stderr?.setEncoding('utf8')
      child.stdout?.on('data', (chunk) => {
        stdout += chunk
      })
      child.stderr?.on('data', (chunk) => {
        stderr += chunk
      })
      child.on('error', reject)
      child.on('close', (status) => {
        resolve({ status, stdout, stderr })
      })
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('failed_for_quality_review')
    expect(result.stderr).toContain('Faltan hitos concretos para cerrar el plan.')
    expect(result.stderr).toContain('critic')
    expect(requests.map((request) => `${request.method} ${new URL(`http://127.0.0.1${request.url}`).pathname}`)).toEqual([
      'POST /api/plan/build',
    ])
    expect(requests.some((request) => new URL(`http://127.0.0.1${request.url}`).pathname === '/api/plan/package')).toBe(false)
  })

  it('fails fast without retrying another provider when the requested provider is blocked', async () => {
    const result = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [
        runPlanScript,
        'Objetivo con usage limit',
        '--profile=c2567794-35f8-45b0-8eea-f0b1b7a86f60',
        '--provider=codex',
        `--base=${baseUrl}`,
        '--detail-weeks=6',
      ], {
        cwd: repoRoot,
        env: {
          ...process.env,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })

      let stdout = ''
      let stderr = ''

      child.stdout?.setEncoding('utf8')
      child.stderr?.setEncoding('utf8')
      child.stdout?.on('data', (chunk) => {
        stdout += chunk
      })
      child.stderr?.on('data', (chunk) => {
        stderr += chunk
      })
      child.on('error', reject)
      child.on('close', (status) => {
        resolve({ status, stdout, stderr })
      })
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('requires_regeneration')
    expect(result.stderr).not.toContain('Reintentando con')
    expect(result.stderr).not.toContain('Plan ID: plan-ollama-123')

    const buildRequests = requests.filter((request) => new URL(`http://127.0.0.1${request.url}`).pathname === '/api/plan/build')
    expect(buildRequests).toHaveLength(1)
    expect(JSON.parse(buildRequests[0]?.body ?? '{}')).toMatchObject({
      goalText: 'Objetivo con usage limit',
      provider: 'codex',
      resourceMode: 'codex',
    })
    expect(requests.some((request) => new URL(`http://127.0.0.1${request.url}`).pathname === '/api/plan/package')).toBe(false)
  })

  it('canonicalizes explicit gpt-5-codex provider requests to codex oauth before calling the API', async () => {
    const result = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [
        runPlanScript,
        'Objetivo con provider gpt-5-codex',
        '--profile=c2567794-35f8-45b0-8eea-f0b1b7a86f60',
        '--provider=openai:gpt-5-codex',
        `--base=${baseUrl}`,
      ], {
        cwd: repoRoot,
        env: {
          ...process.env,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })

      let stdout = ''
      let stderr = ''

      child.stdout?.setEncoding('utf8')
      child.stderr?.setEncoding('utf8')
      child.stdout?.on('data', (chunk) => {
        stdout += chunk
      })
      child.stderr?.on('data', (chunk) => {
        stderr += chunk
      })
      child.on('error', reject)
      child.on('close', (status) => {
        resolve({ status, stdout, stderr })
      })
    })

    expect(result.status).toBe(1)
    const buildRequest = requests.find((request) => new URL(`http://127.0.0.1${request.url}`).pathname === '/api/plan/build')
    expect(buildRequest).toBeTruthy()
    expect(JSON.parse(buildRequest?.body ?? '{}')).toMatchObject({
      goalText: 'Objetivo con provider gpt-5-codex',
      provider: 'codex',
      resourceMode: 'codex',
    })
  })

  it('rejects ollama as an explicit provider before calling the API', async () => {
    const result = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [
        runPlanScript,
        'Objetivo con provider invalido',
        '--profile=c2567794-35f8-45b0-8eea-f0b1b7a86f60',
        '--provider=ollama',
        `--base=${baseUrl}`,
      ], {
        cwd: repoRoot,
        env: {
          ...process.env,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })

      let stdout = ''
      let stderr = ''

      child.stdout?.setEncoding('utf8')
      child.stderr?.setEncoding('utf8')
      child.stdout?.on('data', (chunk) => {
        stdout += chunk
      })
      child.stderr?.on('data', (chunk) => {
        stderr += chunk
      })
      child.on('error', reject)
      child.on('close', (status) => {
        resolve({ status, stdout, stderr })
      })
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Ollama fue removido del camino real')
    expect(requests).toHaveLength(0)
  })

  it('resumes an interactive session with preloaded answers from --answers-json', async () => {
    const result = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [
        runPlanScript,
        'Objetivo con respuestas predefinidas',
        '--profile=c2567794-35f8-45b0-8eea-f0b1b7a86f60',
        '--provider=codex',
        `--base=${baseUrl}`,
        '--detail-weeks=6',
        '--answers-json={"nivel-culinario":"principiante","subtema-italiano":"pastas","ignorada":"x"}',
      ], {
        cwd: repoRoot,
        env: {
          ...process.env,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })

      let stdout = ''
      let stderr = ''

      child.stdout?.setEncoding('utf8')
      child.stderr?.setEncoding('utf8')
      child.stdout?.on('data', (chunk) => {
        stdout += chunk
      })
      child.stderr?.on('data', (chunk) => {
        stderr += chunk
      })
      child.on('error', reject)
      child.on('close', (status) => {
        resolve({ status, stdout, stderr })
      })
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toContain('respuestas predefinidas')
    expect(result.stderr).toContain('Plan ID: plan-complete-123')
    expect(result.stdout).toContain('# Plan: Objetivo con respuestas predefinidas')

    const resumeRequest = requests.find((request) => new URL(`http://127.0.0.1${request.url}`).pathname === '/api/plan/build/resume')
    expect(resumeRequest).toBeTruthy()
    expect(JSON.parse(resumeRequest?.body ?? '{}')).toEqual({
      sessionId: 'session-test-123',
      answers: {
        'nivel-culinario': 'principiante',
        'subtema-italiano': 'pastas',
      },
    })
  })

  it('pauses in auto mode instead of resuming with empty answers when clarification is required', async () => {
    const pendingFile = path.join(repoRoot, '.lap-pending-input.json')
    try { fs.unlinkSync(pendingFile) } catch {}

    const result = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [
        runPlanScript,
        'Objetivo con respuestas predefinidas',
        '--profile=c2567794-35f8-45b0-8eea-f0b1b7a86f60',
        '--provider=codex',
        `--base=${baseUrl}`,
        '--auto',
      ], {
        cwd: repoRoot,
        env: {
          ...process.env,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })

      let stdout = ''
      let stderr = ''

      child.stdout?.setEncoding('utf8')
      child.stderr?.setEncoding('utf8')
      child.stdout?.on('data', (chunk) => { stdout += chunk })
      child.stderr?.on('data', (chunk) => { stderr += chunk })
      child.on('error', reject)
      child.on('close', (status) => {
        resolve({ status, stdout, stderr })
      })
    })

    expect(result.status).toBe(42)
    expect(result.stderr).toContain('Modo auto no puede continuar sin respuestas predefinidas')
    expect(result.stderr).toContain('Preguntas escritas en')
    expect(requests.map((request) => new URL(`http://127.0.0.1${request.url}`).pathname)).toEqual([
      '/api/plan/build',
    ])

    const pendingData = JSON.parse(fs.readFileSync(pendingFile, 'utf8'))
    expect(pendingData.sessionId).toBe('session-test-123')
    expect(pendingData.questions).toHaveLength(2)

    try { fs.unlinkSync(pendingFile) } catch {}
  })

  it('pauses on v6:needs_input with --pause-on-input and writes .lap-pending-input.json', async () => {
    const pendingFile = path.join(repoRoot, '.lap-pending-input.json')
    // Clean up any leftover file
    try { fs.unlinkSync(pendingFile) } catch {}

    const result = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [
        runPlanScript,
        'Objetivo con respuestas predefinidas',
        '--profile=c2567794-35f8-45b0-8eea-f0b1b7a86f60',
        '--provider=codex',
        `--base=${baseUrl}`,
        '--pause-on-input',
      ], {
        cwd: repoRoot,
        env: {
          ...process.env,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })

      let stdout = ''
      let stderr = ''

      child.stdout?.setEncoding('utf8')
      child.stderr?.setEncoding('utf8')
      child.stdout?.on('data', (chunk) => { stdout += chunk })
      child.stderr?.on('data', (chunk) => { stderr += chunk })
      child.on('error', reject)
      child.on('close', (status) => {
        resolve({ status, stdout, stderr })
      })
    })

    expect(result.status).toBe(42)
    expect(result.stderr).toContain('Preguntas escritas en')
    expect(result.stderr).toContain('resume-session=session-test-123')

    const pendingData = JSON.parse(fs.readFileSync(pendingFile, 'utf8'))
    expect(pendingData.sessionId).toBe('session-test-123')
    expect(pendingData.questions).toHaveLength(2)
    expect(pendingData.questions[0].id).toBe('nivel-culinario')
    expect(pendingData.questions[1].id).toBe('subtema-italiano')

    // Clean up
    try { fs.unlinkSync(pendingFile) } catch {}
  })

  it('resumes a paused session with --resume-session and --answers-json', async () => {
    const result = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [
        runPlanScript,
        `--resume-session=session-test-123`,
        `--base=${baseUrl}`,
        '--detail-weeks=6',
        '--answers-json={"nivel-culinario":"principiante","subtema-italiano":"pastas"}',
      ], {
        cwd: repoRoot,
        env: {
          ...process.env,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })

      let stdout = ''
      let stderr = ''

      child.stdout?.setEncoding('utf8')
      child.stderr?.setEncoding('utf8')
      child.stdout?.on('data', (chunk) => { stdout += chunk })
      child.stderr?.on('data', (chunk) => { stderr += chunk })
      child.on('error', reject)
      child.on('close', (status) => {
        resolve({ status, stdout, stderr })
      })
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toContain('Reanudando sesion session-test-123')
    expect(result.stderr).toContain('Respuestas: 2')
    expect(result.stdout).toContain('# Plan:')

    const resumeRequest = requests.find((request) => new URL(`http://127.0.0.1${request.url}`).pathname === '/api/plan/build/resume')
    expect(resumeRequest).toBeTruthy()
    const resumeBody = JSON.parse(resumeRequest?.body ?? '{}')
    expect(resumeBody.sessionId).toBe('session-test-123')
    expect(resumeBody.answers).toEqual({
      'nivel-culinario': 'principiante',
      'subtema-italiano': 'pastas',
    })
  })

  it('writes a structured debug artifact and renders heartbeat output when --debug is enabled', async () => {
    const debugDir = path.join(repoRoot, '.lap-debug')
    const beforeFiles = fs.existsSync(debugDir) ? new Set(fs.readdirSync(debugDir)) : new Set<string>()

    const result = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [
        runPlanScript,
        'Objetivo debug completo',
        '--profile=c2567794-35f8-45b0-8eea-f0b1b7a86f60',
        '--provider=codex',
        `--base=${baseUrl}`,
        '--detail-weeks=6',
        '--debug',
      ], {
        cwd: repoRoot,
        env: {
          ...process.env,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })

      let stdout = ''
      let stderr = ''

      child.stdout?.setEncoding('utf8')
      child.stderr?.setEncoding('utf8')
      child.stdout?.on('data', (chunk) => { stdout += chunk })
      child.stderr?.on('data', (chunk) => { stderr += chunk })
      child.on('error', reject)
      child.on('close', (status) => {
        resolve({ status, stdout, stderr })
      })
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toContain('[debug]')
    expect(result.stderr).toContain('[latido]')
    expect(result.stderr).toContain('Artefacto:')
    expect(result.stderr).toContain('objetivo normalizado:')
    expect(result.stderr).toContain('horizonte: 52 semana(s)')
    expect(result.stderr).toContain('horas: 14 disponibles vs 16 requeridas | gap: -2')
    expect(result.stderr).toContain('fill rate: 84%')
    expect(result.stderr).toContain('comparacion vs vuelta anterior: mejor (+12)')
    expect(result.stderr).toContain('listo para publicar: si')
    expect(result.stdout).toContain('# Plan: Objetivo debug completo')

    const stderrPlain = result.stderr.replace(/\u001b\[[0-9;]*m/g, '')
    const artifactMatch = stderrPlain.match(/Artefacto:\s+(.+\.json)/)
    const artifactPath = artifactMatch?.[1]?.trim()
    expect(artifactPath).toBeTruthy()
    expect(artifactPath ? fs.existsSync(artifactPath) : false).toBe(true)

    const artifact = JSON.parse(fs.readFileSync(artifactPath as string, 'utf8'))
    expect(artifact.summary).toEqual(expect.objectContaining({
      status: 'completed',
      planId: 'plan-debug-123',
      provider: 'codex-oauth',
      modelId: 'openai:gpt-5-codex',
    }))
    expect(artifact.sseEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'v6:debug' }),
      expect.objectContaining({ type: 'v6:heartbeat' }),
      expect.objectContaining({ type: 'v6:complete' }),
    ]))
    expect(artifact.finalPackage).toEqual(expect.objectContaining({
      package: expect.objectContaining({
        publicationState: 'publishable',
      }),
      meta: expect.objectContaining({
        modelId: 'openai:gpt-5-codex',
      }),
    }))
    expect(artifact.latestDebugEvent).toEqual(expect.objectContaining({
      action: 'publication.evaluated',
      details: expect.objectContaining({
        partialKind: 'publication',
        canPublish: true,
      }),
    }))

    const buildRequest = requests.find((request) => new URL(`http://127.0.0.1${request.url}`).pathname === '/api/plan/build')
    expect(buildRequest).toBeTruthy()
    expect(JSON.parse(buildRequest?.body ?? '{}').debug).toBe(true)

    const afterFiles = fs.existsSync(debugDir) ? fs.readdirSync(debugDir) : []
    const createdFiles = afterFiles.filter((file) => !beforeFiles.has(file))
    expect(createdFiles.length).toBeGreaterThanOrEqual(1)

    try { fs.unlinkSync(artifactPath as string) } catch {}
  })
})
