import { describe, expect, it } from 'vitest';

import { healthCard } from '../../src/lib/domain/domain-knowledge/cards/health';
import { buildTemplate } from '../../src/lib/pipeline/shared/template-builder';

describe('buildTemplate', () => {
  it('prefiere actividades concretas del dominio en lugar de reciclar nombres de fase', () => {
    const roadmap = {
      phases: [
        {
          name: 'Base tecnica de salud',
          durationWeeks: 4,
          focus_esAR: 'Sostener actividad viable y medir progreso.',
        },
        {
          name: 'Consolidacion',
          durationWeeks: 8,
          focus_esAR: 'Subir constancia sin castigar el cuerpo.',
        },
      ],
      milestones: ['Sostener rutina de bajo impacto', 'Registrar peso y medidas'],
    };

    const template = buildTemplate(
      {
        goalText: 'Quiero bajar 50kg en 12 meses',
        roadmap,
      },
      {
        goalType: 'QUANT_TARGET_TRACKING',
        confidence: 0.9,
        risk: 'HIGH_HEALTH',
        extractedSignals: {
          isRecurring: false,
          hasDeliverable: false,
          hasNumericTarget: true,
          requiresSkillProgression: false,
          dependsOnThirdParties: false,
          isOpenEnded: false,
          isRelational: false,
        },
      },
      {
        freeHoursWeekday: 3,
        freeHoursWeekend: 5,
        energyLevel: 'medium',
        fixedCommitments: [],
        scheduleConstraints: [],
      },
      healthCard,
    );

    const labels = template.activities.map((activity) => activity.label).join(' ');

    expect(labels).toContain('Caminata constante');
    expect(labels).toContain('Ciclismo suave o bici fija');
    expect(labels).toContain('Natacion o aquagym');
    expect(labels).toContain('Fuerza basica y movilidad');
    expect(labels).toContain('Chequeo de peso y medidas');
    expect(labels).not.toContain('Base tecnica de salud');
    expect(labels).not.toContain('Consolidacion');
  });
});
