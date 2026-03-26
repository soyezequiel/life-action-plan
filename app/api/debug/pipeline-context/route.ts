import { jsonResponse } from '../../_shared'
import { readPipelineRuntimeData, readLatestSuccessfulRuntimeData } from '@lib/flow/pipeline-runtime-data'

export async function GET(): Promise<Response> {
  const latest = readPipelineRuntimeData()
  const latestSuccess = readLatestSuccessfulRuntimeData()

  return jsonResponse({
    data: latest,
    latestSuccess: latestSuccess && latestSuccess.run.runId !== latest?.run.runId
      ? latestSuccess
      : null
  })
}
