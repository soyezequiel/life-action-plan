import { readFileSync } from 'fs'
import { resolve } from 'path'
import { jsonResponse } from '../../_shared'
import type { PipelineRuntimeData } from '@lib/flow/pipeline-runtime-data'

const CONTEXT_FILE = resolve(process.cwd(), 'tmp/pipeline-context.json')

export async function GET(): Promise<Response> {
  try {
    const raw = readFileSync(CONTEXT_FILE, 'utf8')
    const data: PipelineRuntimeData = JSON.parse(raw)
    return jsonResponse({ data })
  } catch {
    return jsonResponse({ data: null })
  }
}
