import { type QuotaInfo, formatQuotaMessage } from '../../../../src/lib/runtime/quota-parser'

function isUsageLimitError(message: string): boolean {
  return /\b(usage limit|rate limit|quota|insufficient_quota)\b/i.test(message);
}

function isSessionAuthError(message: string): boolean {
  return /\b(unauthorized|unauthenticated|authentication|session|expired|invalid api key|forbidden|401)\b/i.test(message);
}

export function buildModelConnectionErrorMessage(
  modelId: string,
  authMode: string | null | undefined,
  rawMessage: string,
  quotaInfo?: QuotaInfo | null,
): string {
  const quotaMessage = formatQuotaMessage(quotaInfo)
  const baseGuidance = isUsageLimitError(rawMessage)
    ? 'Se alcanzo el limite de uso del proveedor. Espera a que se renueve o usa otra credencial o proveedor.'
    : authMode === 'codex-oauth' && isSessionAuthError(rawMessage)
      ? 'Verifica que tu sesion de Codex este activa: ejecuta "codex" en la terminal para re-autenticar.'
      : authMode === 'codex-oauth'
        ? 'Verifica el estado de Codex o proba con otro proveedor si el problema persiste.'
        : 'Verifica tu API key, credencial backend o disponibilidad del proveedor.';

  const guidance = quotaMessage ? `${baseGuidance} ${quotaMessage}` : baseGuidance;

  return `No se pudo conectar con el modelo (${modelId}). Error: ${rawMessage}. ${guidance}`;
}
