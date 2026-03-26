import { NextResponse } from 'next/server'
import { apiErrorMessages, encodeSseData, sseHeaders } from '../../_shared'
import { planBuildRequestSchema } from '../../_schemas'
import { resolveUserId } from '../../_user-settings'
import { processPlanBuild } from '../../../../src/lib/services'
import type { ChargeReasonCode } from '../../../../src/shared/types/lap-api'
import type { ExecutionBlockReason } from '../../../../src/shared/schemas/execution-context'

export const maxDuration = 60

type RouteChargePayload = Record<string, unknown> & {
  reasonCode?: ChargeReasonCode | null
}

type RouteError = Error & {
  executionBlockReasonCode?: ExecutionBlockReason | null
  charge?: RouteChargePayload
  resourceUsage?: unknown
}

export async function POST(request: Request): Promise<Response> {
  const parsed = planBuildRequestSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encodeSseData({
          type: 'result',
          result: {
            success: false,
            error: apiErrorMessages.invalidRequest()
          }
        }))
        controller.close()
      }
    })

    return new NextResponse(stream, { headers: sseHeaders() })
  }

  const data = parsed.data
  const userId = resolveUserId(request)

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encodeSseData(payload))
      }

      try {
        const result = await processPlanBuild(data, {
          userId: userId ?? undefined,
          onProgress: (progress) => {
            send({ type: 'progress', progress })
          }
        })

        send({
          type: 'result',
          result: {
            success: true,
            ...result
          }
        })
      } catch (cause: unknown) {
        const { toPlanBuildErrorMessage, toExecutionBlockErrorMessage, toChargeErrorMessage } = await import('../../_plan')
        const error = (cause instanceof Error ? cause : new Error(String(cause))) as RouteError
        
        let errorMessage: string
        if (error.message === 'PLAN_EXECUTION_BLOCKED') {
          errorMessage = toExecutionBlockErrorMessage(error.executionBlockReasonCode ?? null)
        } else if (error.message === 'OPERATION_CHARGE_REJECTED' || error.message === 'OPERATION_CHARGE_FAILED') {
          errorMessage = toChargeErrorMessage(error.charge?.reasonCode ?? null)
        } else {
          errorMessage = toPlanBuildErrorMessage(error)
        }

        send({
          type: 'result',
          result: {
            success: false,
            error: errorMessage,
            charge: error.charge,
            resourceUsage: error.resourceUsage
          }
        })
      } finally {
        controller.close()
      }
    }
  })

  return new NextResponse(stream, { headers: sseHeaders() })
}
