import { NextResponse } from 'next/server'
import { encodeSseData, sseHeaders } from '../_shared'
import type { FlowTaskProgress } from '../../../src/shared/types/flow-api'

export function sseJsonResponse(executor: (helpers: {
  sendProgress: (progress: FlowTaskProgress) => void
  sendResult: (result: unknown) => void
  close: () => void
}) => Promise<void>): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = () => controller.close()
      const send = (payload: unknown) => controller.enqueue(encodeSseData(payload))

      await executor({
        sendProgress(progress) {
          send({ type: 'progress', progress })
        },
        sendResult(result) {
          send({ type: 'result', result })
        },
        close
      })
    }
  })

  return new NextResponse(stream, { headers: sseHeaders() })
}
