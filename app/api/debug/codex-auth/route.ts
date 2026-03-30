import { jsonResponse } from '../../_shared'

export async function GET(): Promise<Response> {
  try {
    const {
      getCodexAuthAvailability,
      getCodexAuthIdentity,
      getRuntimeCodexAuthFilePath,
    } = await import('../../../../src/lib/auth/codex-auth')

    const [availability, identity] = await Promise.all([
      getCodexAuthAvailability(),
      getCodexAuthIdentity(),
    ])

    return jsonResponse({
      success: true,
      available: availability.available,
      reason: availability.reason,
      runtimeAuthFilePath: getRuntimeCodexAuthFilePath(),
      identity: identity
        ? {
            authFilePath: identity.authFilePath,
            authSource: identity.authSource,
            accountId: identity.accountId,
            email: identity.email,
            name: identity.name,
            planType: identity.planType,
          }
        : null,
    })
  } catch (error) {
    console.error(
      '[LAP] GET /api/debug/codex-auth failed:',
      error instanceof Error ? error.message : error,
    )

    return jsonResponse(
      {
        success: false,
        error: 'No pude leer la identidad de Codex desde backend.',
      },
      { status: 500 },
    )
  }
}
