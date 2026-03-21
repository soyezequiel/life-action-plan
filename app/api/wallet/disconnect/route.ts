import { disconnectWallet } from '../../_wallet'
import { jsonResponse } from '../../_shared'
import { resolveUserId } from '../../_user-settings'

export async function POST(request: Request): Promise<Response> {
  return jsonResponse(await disconnectWallet(resolveUserId(request)))
}
