import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

import type { PhaseIO } from '../pipeline/phase-io'
import type { PlanPackage } from '../pipeline/shared/phase-io'
import type { PipelineRuntimeData } from '../flow/pipeline-runtime-data'

const DEFAULT_CONTEXT_FILE = resolve(process.cwd(), 'tmp/pipeline-context.json')
const DEFAULT_SUCCESS_FILE = resolve(process.cwd(), 'tmp/pipeline-context-success.json')
const DEFAULT_OUTPUT_FILE = resolve(process.cwd(), 'tmp/pipeline-v5-real.json')

export interface DebugPipelineContextReaderOptions {
  contextFile?: string
  successFile?: string
  defaultOutputFile?: string
}

export interface DebugPipelineContextPayload {
  data: PipelineRuntimeData | null
  latestSuccess: PipelineRuntimeData | null
}

interface LatestRunnerPlanResult {
  package: PlanPackage | null
  outputFile: string | null
}

function resolveReaderOptions(
  options: DebugPipelineContextReaderOptions | undefined
): Required<DebugPipelineContextReaderOptions> {
  return {
    contextFile: options?.contextFile ?? DEFAULT_CONTEXT_FILE,
    successFile: options?.successFile ?? DEFAULT_SUCCESS_FILE,
    defaultOutputFile: options?.defaultOutputFile ?? DEFAULT_OUTPUT_FILE
  }
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null
  }

  try {
    const raw = readFileSync(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function resolveComparablePath(filePath: string | null | undefined): string | null {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    return null
  }

  return resolve(filePath)
}

function resolveCandidateOutputFiles(
  latest: PipelineRuntimeData | null,
  latestSuccess: PipelineRuntimeData | null,
  defaultOutputFile: string
): string[] {
  return [
    latest?.run.outputFile ?? null,
    latestSuccess?.run.outputFile ?? null,
    defaultOutputFile
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
}

function readPlanPackageFromFile(filePath: string): PlanPackage | null {
  return readJsonFile<PlanPackage>(filePath)
}

function readLatestRunnerPlanResult(
  latest: PipelineRuntimeData | null,
  latestSuccess: PipelineRuntimeData | null,
  defaultOutputFile: string
): LatestRunnerPlanResult {
  const candidates = resolveCandidateOutputFiles(latest, latestSuccess, defaultOutputFile)

  for (const filePath of candidates) {
    const pkg = readPlanPackageFromFile(filePath)
    if (pkg) {
      return {
        package: pkg,
        outputFile: filePath
      }
    }
  }

  return {
    package: null,
    outputFile: candidates[0] ?? defaultOutputFile
  }
}

function shouldHydrateSnapshot(
  snapshot: PipelineRuntimeData | null,
  result: LatestRunnerPlanResult
): snapshot is PipelineRuntimeData {
  if (!snapshot || !result.package || !result.outputFile) {
    return false
  }

  const snapshotOutputFile = resolveComparablePath(snapshot.run.outputFile)
  const resultOutputFile = resolveComparablePath(result.outputFile)

  return snapshotOutputFile !== null && snapshotOutputFile === resultOutputFile
}

function buildHydratedPackagePhase(
  snapshot: PipelineRuntimeData,
  result: LatestRunnerPlanResult
): PhaseIO<Record<string, unknown>, PlanPackage> {
  const existingPhase = snapshot.phases.package
  const phaseTiming = snapshot.phaseTimeline.package
  const startedAt = existingPhase?.startedAt ?? phaseTiming?.startedAt ?? snapshot.run.startedAt
  const finishedAt = existingPhase?.finishedAt ?? phaseTiming?.finishedAt ?? snapshot.run.finishedAt ?? startedAt
  const durationMs = existingPhase?.durationMs ?? phaseTiming?.durationMs ?? 0

  return {
    input: (existingPhase?.input ?? {}) as Record<string, unknown>,
    output: result.package as PlanPackage,
    processing: existingPhase?.processing ?? '',
    startedAt,
    finishedAt,
    durationMs
  }
}

function hydrateRuntimeSnapshotWithRunnerResult(
  snapshot: PipelineRuntimeData | null,
  result: LatestRunnerPlanResult
): PipelineRuntimeData | null {
  if (!shouldHydrateSnapshot(snapshot, result)) {
    return snapshot
  }

  return {
    ...snapshot,
    phases: {
      ...snapshot.phases,
      package: buildHydratedPackagePhase(snapshot, result)
    }
  }
}

export function readDebugPipelineContextPayload(
  options?: DebugPipelineContextReaderOptions
): DebugPipelineContextPayload {
  const resolved = resolveReaderOptions(options)
  const latest = readJsonFile<PipelineRuntimeData>(resolved.contextFile)
  const latestSuccess = readJsonFile<PipelineRuntimeData>(resolved.successFile)
  const latestRunnerResult = readLatestRunnerPlanResult(latest, latestSuccess, resolved.defaultOutputFile)

  const hydratedLatest = hydrateRuntimeSnapshotWithRunnerResult(latest, latestRunnerResult)
  const hydratedSuccess = hydrateRuntimeSnapshotWithRunnerResult(latestSuccess, latestRunnerResult)

  return {
    data: hydratedLatest,
    latestSuccess: hydratedSuccess && hydratedSuccess.run.runId !== hydratedLatest?.run.runId
      ? hydratedSuccess
      : null
  }
}
