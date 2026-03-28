import { readDebugPipelineContextPayload } from '@lib/debug/pipeline-context-reader'

export async function GET(): Promise<Response> {
  try {
    return Response.json(readDebugPipelineContextPayload())
  } catch {
    return Response.json({
      data: null,
      latestSuccess: null
    })
  }
}
