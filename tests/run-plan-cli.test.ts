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

function createCompleteResponseBody() {
  return [
    'event: v6:complete',
    `data: ${JSON.stringify({
      type: 'v6:complete',
      data: {
        planId: 'plan-complete-123',
        score: 95,
        iterations: 2,
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
    expect(result.stderr).toContain('Reanudando sesión session-test-123')
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
})
