import { jsonResponse } from '../../_shared'
import { getWalletStatus } from '../../_wallet'

export async function GET(): Promise<Response> {
  return jsonResponse(await getWalletStatus())
}

