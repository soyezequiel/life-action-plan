import { getSetting } from '../../_db'
import { jsonResponse } from '../../_shared'

export async function GET(): Promise<Response> {
  return jsonResponse((await getSetting('lastProfileId')) ?? null)
}
