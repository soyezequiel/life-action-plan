import { jsonResponse } from '../../_shared'
import { getWalletStatus } from '../../_wallet'
import { resolveUserId } from '../../_user-settings'

export async function GET(request: Request): Promise<Response> {
  return jsonResponse(await getWalletStatus(resolveUserId(request)))
}
