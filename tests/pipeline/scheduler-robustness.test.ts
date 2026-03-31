import { describe, it, expect } from 'vitest';
import { buildTemplate } from '../../src/lib/pipeline/shared/template-builder';
import type { TemplateInput, UserProfileV5 } from '../../src/lib/pipeline/shared/phase-io';
import type { GoalClassification } from '../../src/lib/domain/goal-taxonomy';

describe('Scheduler Robustness (Budget Squeezing)', () => {
  const mockProfile: UserProfileV5 = {
    freeHoursWeekday: 2, // 10h total semanal L-V
    freeHoursWeekend: 1, // 2h total finde
    energyLevel: 'medium',
    fixedCommitments: []
  }; // Total 12h/semana. Target 85% = 10.2h 

  const mockClassification: GoalClassification = {
    goalType: 'FINITE_PROJECT',
    confidence: 1,
    risk: 'LOW',
    extractedSignals: {
      isRecurring: false,
      hasDeliverable: true,
      hasNumericTarget: false,
      requiresSkillProgression: false,
      dependsOnThirdParties: false,
      isOpenEnded: false,
      isRelational: false
    }
  };

  const mockInput: TemplateInput = {
    goalText: 'Aprender algo complejo',
    roadmap: {
      phases: [
        { id: 'p1', name: 'Fase 1', focus_esAR: 'Estudio intenso 1', startMonth: 1, endMonth: 1, hoursPerWeek: 5, milestone: 'M1', metrics: [], dependencies: [], failureMode: '', mitigation: '' },
        { id: 'p2', name: 'Fase 2', focus_esAR: 'Estudio intenso 2', startMonth: 1, endMonth: 1, hoursPerWeek: 5, milestone: 'M2', metrics: [], dependencies: [], failureMode: '', mitigation: '' },
        { id: 'p3', name: 'Fase 3', focus_esAR: 'Estudio intenso 3', startMonth: 1, endMonth: 1, hoursPerWeek: 5, milestone: 'M3', metrics: [], dependencies: [], failureMode: '', mitigation: '' },
        { id: 'p4', name: 'Fase 4', focus_esAR: 'Estudio intenso 4', startMonth: 1, endMonth: 1, hoursPerWeek: 5, milestone: 'M4', metrics: [], dependencies: [], failureMode: '', mitigation: '' },
      ],
      milestones: [],
      title: 'Plan Ambicioso',
      summary: 'Test',
      totalMonths: 4,
      estimatedWeeklyHours: 20
    }
  };

  it('debe reducir la carga horaria si el plan original excede el presupuesto del usuario', () => {
    // Originalmente 4 fases * 2 frec * 1h = 8h (si baseFreq es 2)
    // Pero si el perfil es muy bajo, queremos ver que no se pase.

    const result = buildTemplate(mockInput, mockClassification, mockProfile);

    const totalHours = result.activities.reduce((acc, a) => acc + (a.durationMin * a.frequencyPerWeek) / 60, 0);

    const budget = (mockProfile.freeHoursWeekday * 5) + (mockProfile.freeHoursWeekend * 2);

    console.log(`Budget: ${budget}h, Requested: ${totalHours}h`);

    // El budget es 12h. Si el template generó 4 actividades de 1h con freq 2, son 8h. Eso entra.
    // Vamos a forzar a que sea mayor. Si baseFreq fuera 4, serían 16h.
    expect(totalHours).toBeLessThanOrEqual(budget * 0.9);
  });

  it('debe reducir frecuencia antes que duración', () => {
    const tightProfile = { ...mockProfile, freeHoursWeekday: 1, freeHoursWeekend: 0 }; // 5h/semana
    const result = buildTemplate(mockInput, mockClassification, tightProfile);

    const totalHours = result.activities.reduce((acc, a) => acc + (a.durationMin * a.frequencyPerWeek) / 60, 0);
    expect(totalHours).toBeLessThanOrEqual(5 * 0.9);

    // Verificar que al menos alguna frecuencia bajó a 1
    const hasLowFreq = result.activities.some(a => a.frequencyPerWeek === 1);
    expect(hasLowFreq).toBe(true);
  });
});
