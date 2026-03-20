import { NextResponse } from 'next/server'
import { t } from '../../src/i18n'

const encoder = new TextEncoder()

export const apiErrorMessages = {
  invalidRequest: (): string => t('errors.invalid_request'),
  profileNotFound: (): string => t('errors.profile_not_found'),
  planNotFound: (): string => t('errors.plan_not_found'),
  localAssistantUnavailable: (): string => t('builder.local_unavailable_deploy')
}

export function jsonResponse<T>(body: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, init)
}

export function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  }
}

export function encodeSseData(payload: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
}

export function safeParseJsonRecord(value: string | null | undefined): Record<string, unknown> {
  if (!value) {
    return {}
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}
