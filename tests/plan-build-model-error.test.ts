import { describe, expect, it } from 'vitest';

import { buildModelConnectionErrorMessage } from '../app/api/plan/build/_model-connection-error';

describe('buildModelConnectionErrorMessage', () => {
  it('no sugiere reautenticacion cuando el proveedor reporta limite de uso', () => {
    const message = buildModelConnectionErrorMessage(
      'openai:gpt-5-codex',
      'codex-oauth',
      'Failed after 3 attempts. Last error: The usage limit has been reached.',
    );

    expect(message).toContain('limite de uso');
    expect(message).not.toContain('re-autenticar');
  });
 
  it('incluye informacion de cuota cuando se provee', () => {
    const message = buildModelConnectionErrorMessage(
      'openai:gpt-5-codex',
      'api-key',
      'The usage limit has been reached.',
      { remainingRequests: 5, resetRequests: '12s' },
    );
 
    expect(message).toContain('limite de uso');
    expect(message).toContain('5 req');
    expect(message).toContain('12s');
  });
 
  it('formatea correctamente el limite de Codex (5h y 7d) desde un JSON de error', () => {
    const codexErrorBody = JSON.stringify({
      detail: {
        usage_data: {
          codex_5h: { limit: 0, remaining: 0 },
          codex_7d: { limit: 100, remaining: 0, reset: '2026-04-02T15:31:00Z' },
        },
      },
    });
 
    const message = buildModelConnectionErrorMessage(
      'openai:gpt-5-codex',
      'codex-oauth',
      'Usage limit reached',
      { 
        codexUsage: {
          codex_5h: { limit: 0, remaining: 0 },
          codex_7d: { limit: 100, remaining: 0, reset: '2026-04-02T15:31:00Z' }
        }
      },
    );
 
    expect(message).toContain('Uso Codex 5h: no expuesto por el backend para esta cuenta');
    expect(message).toContain('Uso Codex 7d: 100% usado | 0% disponible | reinicia 2026-04-02 15:31');
  });

  it('mantiene la sugerencia de reautenticacion para errores de sesion de Codex', () => {
    const message = buildModelConnectionErrorMessage(
      'openai:gpt-5-codex',
      'codex-oauth',
      'Unauthorized',
    );

    expect(message).toContain('re-autenticar');
  });
});
