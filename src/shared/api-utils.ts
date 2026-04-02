import { t } from '../i18n'

export const apiErrorMessages = {
  invalidRequest: (): string => t('errors.invalid_request'),
  profileNotFound: (): string => t('errors.profile_not_found'),
  planNotFound: (): string => t('errors.plan_not_found'),
  startDatePast: (): string => t('errors.plan_start_date_past'),
  localAssistantUnavailable: (): string => t('builder.local_unavailable_deploy')
}

export function sseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  }
}

const encoder = new TextEncoder()

export function encodeSseData(payload: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
}
