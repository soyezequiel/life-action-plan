import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';

import { packagePlan } from '../../src/lib/pipeline/v5/packager';
import type { PackageInput } from '../../src/lib/pipeline/v5/phase-io-v5';

describe('packagePlan', () => {
  it('arma un paquete deterministico con items polimorficos, score e intenciones', () => {
    const createdAt = '2026-03-30T00:00:00.000Z';
    const input: PackageInput = {
      goalText: 'Terminar el portfolio',
      goalId: 'goal-1',
      weekStartDate: '2026-03-30T00:00:00Z',
      roadmap: {
        phases: [
          { name: 'Fundamentos', durationWeeks: 2, focus_esAR: 'Ordenar base y foco' },
          { name: 'Cierre', durationWeeks: 1, focus_esAR: 'Preparar entrega final' },
        ],
        milestones: ['Tener una version presentable', 'Publicarlo'],
      },
      finalSchedule: {
        events: [
          {
            id: 'ev-1',
            kind: 'time_event',
            title: 'Bloque de portfolio',
            status: 'active',
            goalIds: ['goal-1'],
            startAt: '2026-03-30T18:00:00.000Z',
            durationMin: 60,
            rigidity: 'soft',
            createdAt,
            updatedAt: createdAt,
          },
        ],
        unscheduled: [
          {
            activityId: 'phase-cierre',
            reason: 'scheduled 0 of 1 sessions',
            suggestion_esAR: 'Mover una hora del finde para cerrar detalles.',
          },
        ],
        tradeoffs: [],
        metrics: {
          fillRate: 0.5,
          solverTimeMs: 12,
          solverStatus: 'feasible',
        },
      },
      hardFindings: [],
      softFindings: [
        {
          code: 'SV-LATE-DEEPWORK',
          severity: 'WARN',
          suggestion_esAR: 'No dejes lo mas pesado para muy tarde.',
        },
      ],
      coveFindings: [
        {
          question: '¿Hay espacio para cerrar?',
          answer: 'No todo entra en la semana actual.',
          severity: 'WARN',
        },
      ],
    };

    const result = packagePlan(input);

    expect(result.qualityScore).toBe(40);
    expect(result.summary_esAR).toContain('Terminar el portfolio');
    expect(result.implementationIntentions[0]).toContain('entonces hago Bloque de portfolio');
    expect(result.warnings).toContain('Hay actividades que no entraron en la semana y quedaron como pendientes.');
    expect(result.items.some((item) => item.kind === 'time_event')).toBe(true);
    expect(result.items.some((item) => item.kind === 'milestone')).toBe(true);
    expect(result.items.some((item) => item.kind === 'flex_task')).toBe(true);
    expect(result.items.some((item) => item.kind === 'metric')).toBe(true);

    const milestone = result.items.find((item) => item.kind === 'milestone');
    expect(milestone && 'dueDate' in milestone ? milestone.dueDate : '').toBe(
      DateTime.fromISO('2026-03-30T00:00:00Z', { zone: 'UTC' }).plus({ weeks: 2 }).toISODate(),
    );
  });
});
