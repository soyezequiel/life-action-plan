import { jsonResponse } from '../../_shared'
import { readPipelineRuntimeData } from '@lib/flow/pipeline-runtime-data'

export async function GET(): Promise<Response> {
  return jsonResponse({ data: readPipelineRuntimeData() })
}
