import { listAvailableServiceModels } from '../../../../src/lib/providers/service-model-availability'
import { jsonResponse } from '../../_shared'

export async function GET(): Promise<Response> {
  const models = await listAvailableServiceModels()

  return jsonResponse({
    success: true,
    models
  })
}
