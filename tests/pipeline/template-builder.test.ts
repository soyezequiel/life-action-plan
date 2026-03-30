import { describe, expect, it } from 'vitest';

import { cocinaItalianaCard } from '../../src/lib/domain/domain-knowledge/cards/cocina-italiana';
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

  it('mantiene la referencia de cocina italiana neutral al metodo y no fuerza libros', () => {
    const roadmap = {
      phases: [
        {
          name: 'Primer repertorio de pastas italianas con videos',
          durationWeeks: 2,
          focus_esAR: 'Tomar videos paso a paso de pasta al pomodoro como referencia concreta.',
        },
        {
          name: 'Recetas repetibles de pastas italianas',
          durationWeeks: 1,
          focus_esAR: 'Repetir cacio e pepe y aglio e olio hasta estabilizar tecnica y punto.',
        },
        {
          name: 'Menu corto de pastas italianas para 1 mes',
          durationWeeks: 1,
          focus_esAR: 'Cerrar 1 mes con un menu corto de dos platos de pasta.',
        },
      ],
      milestones: ['Preparar un menu corto de pastas italianas'],
    };

    const template = buildTemplate(
      {
        goalText: 'Quiero aprender a cocinar platos italianos',
        roadmap,
      },
      {
        goalType: 'SKILL_ACQUISITION',
        confidence: 0.9,
        risk: 'LOW',
        extractedSignals: {
          isRecurring: false,
          hasDeliverable: false,
          hasNumericTarget: false,
          requiresSkillProgression: true,
          dependsOnThirdParties: false,
          isOpenEnded: false,
          isRelational: false,
        },
      },
      {
        freeHoursWeekday: 2,
        freeHoursWeekend: 4,
        energyLevel: 'medium',
        fixedCommitments: [],
        scheduleConstraints: [],
      },
      cocinaItalianaCard,
    );

    const labels = template.activities.map((activity) => activity.label).join(' ');

    expect(labels).toContain('referencia concreta de cocina italiana');
    expect(labels).not.toContain('Lectura de recetas italianas en libros');
  });

  it('vuelve accion concreta un task de dominio cuando el label se fuga al nombre de una fase', () => {
    const roadmap = {
      phases: [
        {
          name: 'Practica principiante de masas y pastas frescas con salsas base italianas',
          durationWeeks: 5,
          focus_esAR: 'Repetir masas simples y salsas base hasta estabilizar textura y sabor.',
        },
      ],
      milestones: ['Resolver una salsa base italiana repetible'],
    };

    const template = buildTemplate(
      {
        goalText: 'Quiero aprender cocina italiana, especialmente pastas y salsas',
        roadmap,
      },
      {
        goalType: 'SKILL_ACQUISITION',
        confidence: 0.9,
        risk: 'LOW',
        extractedSignals: {
          isRecurring: false,
          hasDeliverable: false,
          hasNumericTarget: false,
          requiresSkillProgression: true,
          dependsOnThirdParties: false,
          isOpenEnded: false,
          isRelational: false,
        },
      },
      {
        freeHoursWeekday: 2,
        freeHoursWeekend: 4,
        energyLevel: 'medium',
        fixedCommitments: [],
        scheduleConstraints: [],
      },
      cocinaItalianaCard,
    );

    const labels = template.activities.map((activity) => activity.label);

    expect(labels).toContain('Practicar salsas base italianas');
    expect(labels).not.toContain('Salsas base italianas');
  });
});
