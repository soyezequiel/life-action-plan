import { NextResponse } from 'next/server'
import { apiErrorMessages, encodeSseData, sseHeaders } from '../../_shared'
import { planBuildRequestSchema } from '../../_schemas'
import { resolveUserId } from '../../_user-settings'
import { processPlanBuild } from '../../../../src/lib/services'

export const maxDuration = 60

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
      } catch (error: any) {
        const { toPlanBuildErrorMessage } = await import('../../_plan')
        send({
          type: 'result',
          result: {
            success: false,
            error: toPlanBuildErrorMessage(error),
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
