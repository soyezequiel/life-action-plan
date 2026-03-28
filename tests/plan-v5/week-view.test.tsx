// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { WeekView } from '../../components/plan-viewer/WeekView';
import { getPlanPackageMock } from '../helpers/plan-package.mock';
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

  it('muestra tareas flexibles e hitos cuando todavia no hay bloques agendados', () => {
    const pkg = getPlanPackageMock('plan-v5-week-deferred');
    const operational = {
      ...pkg.plan.operational,
      scheduledEvents: [],
      buffers: [],
      days: pkg.plan.operational.days.map((day) => ({
        ...day,
        scheduledEvents: [],
        buffers: [],
      })),
    };
    const flexTask = {
      id: 'flex-legal-research',
      kind: 'flex_task' as const,
      title: 'Bajar el objetivo a pasos verificables',
      notes: 'Separar investigacion, viabilidad y actores clave antes de calendarizar.',
      status: 'waiting' as const,
      goalIds: pkg.plan.goalIds,
      estimateMin: 45,
      dueDate: '2026-04-12',
      createdAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:00:00.000Z',
    };

    render(
      <WeekView
        operational={operational}
        goalIds={pkg.plan.goalIds}
        items={[flexTask, ...pkg.items.filter((item) => item.kind === 'milestone')]}
      />,
    );

    expect(screen.getByRole('heading', { name: t('planV5.week.deferredTitle') })).toBeTruthy();
    expect(screen.getByText('Bajar el objetivo a pasos verificables')).toBeTruthy();
    expect(screen.getByText(t('planV5.week.flexTitle'))).toBeTruthy();
    expect(screen.getByText(t('planV5.week.milestonesTitle'))).toBeTruthy();
  });
});
