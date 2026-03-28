import { jsonResponse } from '../../_shared'
import runnerResults from '@lib/debug/v5-runner-results'
import { readPipelineRuntimeData, readLatestSuccessfulRuntimeData } from '@lib/flow/pipeline-runtime-data'

export async function GET(): Promise<Response> {
  const latestRunnerResult = runnerResults.readLatestRunnerPlanResult()
  const latest = runnerResults.hydrateRuntimeSnapshotWithRunnerResult(readPipelineRuntimeData(), latestRunnerResult)
  const latestSuccess = runnerResults.hydrateRuntimeSnapshotWithRunnerResult(readLatestSuccessfulRuntimeData(), latestRunnerResult)

  return jsonResponse({
    data: latest,
    latestSuccess: latestSuccess && latestSuccess.run.runId !== latest?.run.runId
      ? latestSuccess
      : null
  })
}
