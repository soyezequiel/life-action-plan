// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { WeekView } from '../../components/plan-v5/WeekView';
import { getPlanPackageMock } from '../../src/lib/pipeline/v5/__mocks__/plan-package.mock';
import { t } from '../../src/i18n';

describe('WeekView', () => {
  it('ubica bloques en el slot horario correcto y abre el detalle del evento', async () => {
    const pkg = getPlanPackageMock('plan-v5-week');
    const user = userEvent.setup();

    render(
      <WeekView
        operational={pkg.plan.operational}
        goalIds={pkg.plan.goalIds}
      />,
    );

    const firstBlock = screen.getByTestId('week-block-run-easy_s01');
    expect(firstBlock.getAttribute('data-start-hour')).toBe('7');
    expect(firstBlock.getAttribute('data-start-minute')).toBe('0');

    await user.click(firstBlock);

    expect(screen.getByRole('button', { name: t('planV5.week.close') })).toBeTruthy();
    expect(screen.getByText(t('planV5.week.goal'))).toBeTruthy();
    expect(screen.getByText(t('planV5.rigidity.soft'))).toBeTruthy();
  });
});
