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

  it('mantiene la sugerencia de reautenticacion para errores de sesion de Codex', () => {
    const message = buildModelConnectionErrorMessage(
      'openai:gpt-5-codex',
      'codex-oauth',
      'Unauthorized',
    );

    expect(message).toContain('re-autenticar');
  });
});
