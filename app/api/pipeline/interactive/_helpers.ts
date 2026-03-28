import { ZodError } from 'zod'

import { jsonResponse, apiErrorMessages } from '../../_shared'
import { resolveAuthenticatedUserId, resolveUserId } from '../../_user-settings'
import { t } from '../../../../src/i18n'
import { InteractivePipelineCoordinator } from '../../../../src/lib/pipeline/v5/interactive-coordinator'

const INTERACTIVE_ERROR_STATUS: Record<string, number> = {
  INTERACTIVE_SESSION_NOT_FOUND: 404,
  INTERACTIVE_WORKFLOW_NOT_FOUND: 404,
  INTERACTIVE_SESSION_EXPIRED: 410,
  INTERACTIVE_SESSION_NOT_ACTIVE: 409,
  NO_ACTIVE_PAUSE: 409,
  PAUSE_NOT_ACTIVE: 409,
  INTERACTIVE_CLASSIFY_CONTEXT_TOO_SHORT: 400,
  INTERACTIVE_REQUIREMENTS_MINIMUM_ANSWER: 400,
  INTERACTIVE_PACKAGE_REGENERATE_PHASE_REQUIRED: 400,
  BUILD_RUNTIME_UNAVAILABLE: 503,
  PLAN_EXECUTION_BLOCKED: 503,
  INTERACTIVE_STATE_MISSING: 500,
  INTERACTIVE_CLASSIFICATION_MISSING: 500,
  INTERACTIVE_PROFILE_MISSING: 500,
  INTERACTIVE_SCHEDULE_CONTEXT_MISSING: 500,
  INTERACTIVE_PACKAGE_MISSING: 500
}

function getErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.split(':', 1)[0]?.trim() || 'UNKNOWN_ERROR'
}

function toInteractiveErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return apiErrorMessages.invalidRequest()
  }

  const rawMessage = error instanceof Error ? error.message.trim() : String(error).trim()
  const errorCode = getErrorCode(error)

  if (errorCode === 'INTERACTIVE_SESSION_NOT_FOUND') {
    return t('errors.interactive_session_not_found')
  }

  if (errorCode === 'INTERACTIVE_WORKFLOW_NOT_FOUND') {
    return t('errors.interactive_workflow_not_found')
  }

  if (errorCode === 'INTERACTIVE_SESSION_EXPIRED') {
    return t('errors.interactive_session_expired')
  }

  if (errorCode === 'INTERACTIVE_SESSION_NOT_ACTIVE') {
    return t('errors.interactive_session_not_active')
  }

  if (errorCode === 'NO_ACTIVE_PAUSE' || errorCode === 'PAUSE_NOT_ACTIVE') {
    return t('errors.interactive_pause_not_active')
  }

  if (errorCode === 'INTERACTIVE_CLASSIFY_CONTEXT_TOO_SHORT') {
    return t('errors.interactive_classify_context_short')
  }

  if (errorCode === 'INTERACTIVE_REQUIREMENTS_MINIMUM_ANSWER') {
    return t('errors.interactive_requirements_minimum_answer')
  }

  if (errorCode === 'INTERACTIVE_PACKAGE_REGENERATE_PHASE_REQUIRED') {
    return t('errors.interactive_regenerate_phase_required')
  }

  if (errorCode === 'V5_OPERATIONAL_REPAIR_ESCALATED' || errorCode === 'V5_OPERATIONAL_INVALID') {
    return t('errors.interactive_package_invalid')
  }

  if (
    errorCode === 'BUILD_RUNTIME_UNAVAILABLE'
    || errorCode === 'PLAN_EXECUTION_BLOCKED'
    || errorCode === 'INTERACTIVE_STATE_MISSING'
    || errorCode === 'INTERACTIVE_CLASSIFICATION_MISSING'
    || errorCode === 'INTERACTIVE_PROFILE_MISSING'
    || errorCode === 'INTERACTIVE_SCHEDULE_CONTEXT_MISSING'
    || errorCode === 'INTERACTIVE_PACKAGE_MISSING'
    || errorCode.startsWith('INTERACTIVE_PAUSE_UNSUPPORTED')
  ) {
    return t('errors.service_unavailable')
  }

  if (!rawMessage || /^[A-Z0-9_:-]+$/.test(rawMessage)) {
    return t('errors.generic')
  }

  return rawMessage
}

function toInteractiveErrorStatus(error: unknown): number {
  if (error instanceof ZodError) {
    return 400
  }

  return INTERACTIVE_ERROR_STATUS[getErrorCode(error)] ?? 500
}

export function createInteractiveCoordinator(request: Request): InteractivePipelineCoordinator {
  return new InteractivePipelineCoordinator({
    ownerUserId: resolveAuthenticatedUserId(request),
    executionUserId: resolveUserId(request)
  })
}

export function interactiveInvalidRequestResponse(): Response {
  return jsonResponse({ error: apiErrorMessages.invalidRequest() }, { status: 400 })
}

export async function readInteractiveRequestBody(request: Request): Promise<unknown> {
  try {
    const raw = await request.text()
    return raw.trim() ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function interactiveErrorResponse(error: unknown): Response {
  return jsonResponse({
    error: toInteractiveErrorMessage(error)
  }, {
    status: toInteractiveErrorStatus(error)
  })
}
