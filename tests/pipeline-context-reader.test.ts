import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { resolve } from 'path'

import { afterEach, describe, expect, it } from 'vitest'

import { readDebugPipelineContextPayload } from '../src/lib/debug/pipeline-context-reader'
import { createEmptyPipelineRuntimeData } from '../src/lib/flow/pipeline-runtime-data'
import { getPlanPackageMock } from './helpers/plan-package.mock'

const TEST_ROOT = resolve(process.cwd(), 'tmp/test-pipeline-context-reader')

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(resolve(filePath, '..'), { recursive: true })
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8')
}

describe('pipeline context reader', () => {
  afterEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true })
  })

  it('hidrata package desde el archivo final sin depender del recorder runtime', () => {
    const contextFile = resolve(TEST_ROOT, 'pipeline-context.json')
    const successFile = resolve(TEST_ROOT, 'pipeline-context-success.json')
    const outputFile = resolve(TEST_ROOT, 'pipeline-v5-real.json')
    const latest = createEmptyPipelineRuntimeData({
      source: 'interactive',
      modelId: 'openai:gpt-4o-mini',
      goalText: 'Aprender dibujo',
      outputFile
    })
    const latestSuccess = createEmptyPipelineRuntimeData({
      source: 'interactive',
      modelId: 'openai:gpt-4o-mini',
      goalText: 'Aprender dibujo',
      outputFile
    })
    const pkg = getPlanPackageMock('pipeline-context-reader')

    latest.run.runId = 'run-latest'
    latest.phaseStatuses.package = 'success'
    latest.phases.package = {
      input: {},
      output: { qualityScore: 0.2 },
      processing: 'Empaqueta el resultado.',
      startedAt: '2026-03-30T00:00:00.000Z',
      finishedAt: '2026-03-30T00:00:01.000Z',
      durationMs: 1000
    }

    latestSuccess.run.runId = 'run-success'
    latestSuccess.phaseStatuses.package = 'success'
    latestSuccess.phases.package = latest.phases.package

    writeJson(contextFile, latest)
    writeJson(successFile, latestSuccess)
    writeJson(outputFile, pkg)

    const payload = readDebugPipelineContextPayload({
      contextFile,
      successFile,
      defaultOutputFile: outputFile
    })

    expect(payload.data?.phases.package?.processing).toBe('Empaqueta el resultado.')
    expect(payload.data?.phases.package?.output).toEqual(pkg)
    expect(payload.latestSuccess?.run.runId).toBe('run-success')
    expect(payload.latestSuccess?.phases.package?.output).toEqual(pkg)
  })

  it('devuelve nulls si el snapshot esta corrupto en lugar de romper la ruta', () => {
    const contextFile = resolve(TEST_ROOT, 'pipeline-context.json')

    mkdirSync(TEST_ROOT, { recursive: true })
    writeFileSync(contextFile, '{invalid-json', 'utf8')

    const payload = readDebugPipelineContextPayload({
      contextFile,
      successFile: resolve(TEST_ROOT, 'missing-success.json'),
      defaultOutputFile: resolve(TEST_ROOT, 'missing-plan.json')
    })

    expect(payload).toEqual({
      data: null,
      latestSuccess: null
    })
  })
})
