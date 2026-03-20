import { disconnectWallet } from '../../_wallet'
import { jsonResponse } from '../../_shared'

export async function POST(): Promise<Response> {
  return jsonResponse(await disconnectWallet())
}

