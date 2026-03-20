import { walletConnectRequestSchema } from '../../_schemas'
import { connectWallet } from '../../_wallet'
import { jsonResponse } from '../../_shared'

export async function POST(request: Request): Promise<Response> {
  const parsed = walletConnectRequestSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    return jsonResponse({
      success: false,
      status: {
        configured: false,
        connected: false,
        canUseSecureStorage: false
      },
      error: 'Datos invalidos en la solicitud.'
    }, { status: 400 })
  }

  return jsonResponse(await connectWallet(parsed.data.connectionUrl))
}

