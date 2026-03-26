// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TradeoffDialog } from '../../components/plan-v5/TradeoffDialog';
import { getPlanPackageMock } from '../../src/lib/pipeline/v5/__mocks__/plan-package.mock';
import { t } from '../../src/i18n';

describe('TradeoffDialog', () => {
  it('muestra ambas opciones del backend y registra la seleccion', async () => {
    const pkg = getPlanPackageMock('plan-v5-tradeoff');
    const tradeoffs = pkg.tradeoffs ?? [];
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <TradeoffDialog
        open
        tradeoffs={tradeoffs}
        onClose={() => {}}
      />,
    );

    expect(screen.getByRole('heading', { name: t('planV5.tradeoff.title') })).toBeTruthy();
    expect(screen.getByText(tradeoffs[0].question_esAR)).toBeTruthy();
    expect(screen.getByText(tradeoffs[0].planA.description_esAR)).toBeTruthy();
    expect(screen.getByText(tradeoffs[0].planB.description_esAR)).toBeTruthy();

    const buttons = screen.getAllByRole('button', { name: t('planV5.tradeoff.select') });
    await user.click(buttons[0]);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy.mock.calls[0][0]).toContain('A');
  });
});
