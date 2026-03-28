// @vitest-environment jsdom

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '../../src/i18n';
import { usePlanV5 } from '../../src/lib/client/use-plan-v5';
import { getAdaptiveOutputMock, getPlanPackageMock } from '../helpers/plan-package.mock';

function jsonResponse(payload: unknown, ok = true): Response {
  return {
    ok,
    json: async () => payload,
  } as Response;
}

function Probe({ planId }: { planId: string }) {
  const state = usePlanV5(planId);

  return (
    <div>
      <span>{state.loading ? t('planV5.loading') : 'ready'}</span>
      <span>{state.package?.summary_esAR ?? 'no-package'}</span>
      <span>{state.adaptive?.mode ?? 'no-adaptive'}</span>
      <span>{`status:${state.adaptiveStatus}`}</span>
      <span>{state.error ?? 'no-error'}</span>
      <button type="button" onClick={state.refetch}>
        {t('planV5.refresh')}
      </button>
    </div>
  );
}

describe('usePlanV5', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('carga el package y adaptive y permite refrescar', async () => {
    const pkg = getPlanPackageMock('plan-v5-hook');
    const adaptive = await getAdaptiveOutputMock('plan-v5-hook');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: pkg }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, status: 'ready', data: adaptive }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: pkg }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, status: 'ready', data: adaptive }));

    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<Probe planId="plan-v5-hook" />);

    expect(screen.getByText(t('planV5.loading'))).toBeTruthy();
    expect(await screen.findByText(pkg.summary_esAR)).toBeTruthy();
    expect(screen.getByText(adaptive.mode)).toBeTruthy();
    expect(screen.getByText('status:ready')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: t('planV5.refresh') }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });
});
