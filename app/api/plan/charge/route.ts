import { z } from 'zod'
import { jsonResponse } from '../../_shared'
import { resolveUserId } from '../../_user-settings'
import { chargeOperation } from '../../../../src/lib/payments/operation-charging'
import { getEstimatedOperationChargeSats } from '../../../../src/lib/payments/billing-policy'

const chargeRequestSchema = z.object({
  profileId: z.string().uuid(),
}).strict()

export async function POST(request: Request): Promise<Response> {
  const userId = resolveUserId(request)
  const body = await request.json().catch(() => ({}))
  const parsed = chargeRequestSchema.safeParse(body)

  if (!parsed.success) {
    return jsonResponse({ success: false, error: 'INVALID_REQUEST' }, { status: 400 })
  }

  try {
    const amountSats = getEstimatedOperationChargeSats('plan_build')
    
    // Si el costo es 0 o menor, no es necesario cobrar (ej. ejecución local o recursos de usuario)
    if (amountSats <= 0) {
      return jsonResponse({
        success: true,
        transactionId: 'skipped_no_charge',
        chargedSats: 0,
        wallet: null
      })
    }

    const result = await chargeOperation({
      operation: 'plan_build',
      amountSats,
      description: `Creación de plan LAP para el perfil ${parsed.data.profileId.slice(0, 8)}`,
      userId: userId ?? undefined
    })

    if (result.status === 'paid') {
      return jsonResponse({
        success: true,
        transactionId: result.lightningPaymentHash,
        chargedSats: result.chargedSats,
        wallet: result.wallet
      })
    }

    if (result.status === 'skipped') {
       return jsonResponse({
        success: true,
        transactionId: 'skipped_by_policy',
        chargedSats: 0,
        wallet: result.wallet
      })
    }

    return jsonResponse({
      success: false,
      error: result.reasonCode || 'PAYMENT_FAILED',
      detail: result.reasonDetail
    }, { status: 402 }) // Payment Required

  } catch (error) {
    console.error('[API:Charge] Error fatal:', error)
    return jsonResponse({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      detail: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
