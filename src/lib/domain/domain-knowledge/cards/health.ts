/**
 * Domain Knowledge Card - Salud / Weight management
 *
 * Sources:
 *  - ACSM position stands on physical activity and exercise prescription (C)
 *  - WHO physical activity guidelines (C)
 *  - BJSM reviews on progressive load and injury prevention (A)
 */

import type { DomainKnowledgeCard } from '../bank';

export const healthCard: DomainKnowledgeCard = {
  domainLabel: 'salud',

  goalTypeCompatibility: ['RECURRENT_HABIT', 'QUANT_TARGET_TRACKING', 'HIGH_UNCERTAINTY_TRANSFORM'],

  tasks: [
    {
      id: 'health_walk',
      label: 'Caminata constante',
      typicalDurationMin: 45,
      tags: ['low-impact', 'aerobic', 'adherence'],
      equivalenceGroupId: 'health-low-impact-cardio',
    },
    {
      id: 'health_cycling',
      label: 'Ciclismo suave o bici fija',
      typicalDurationMin: 45,
      tags: ['low-impact', 'cardio', 'cycling'],
      equivalenceGroupId: 'health-low-impact-cardio',
    },
    {
      id: 'health_swimming',
      label: 'Natacion o aquagym',
      typicalDurationMin: 40,
      tags: ['low-impact', 'cardio', 'swimming'],
      equivalenceGroupId: 'health-low-impact-cardio',
    },
    {
      id: 'health_strength',
      label: 'Fuerza basica y movilidad',
      typicalDurationMin: 30,
      tags: ['strength', 'mobility', 'support'],
      equivalenceGroupId: 'health-support-work',
    },
    {
      id: 'health_checkin',
      label: 'Chequeo de peso y medidas',
      typicalDurationMin: 15,
      tags: ['tracking', 'review', 'measurement'],
      equivalenceGroupId: 'health-review',
    },
  ],

  metrics: [
    {
      id: 'body_weight',
      label: 'Peso corporal',
      unit: 'kg',
      direction: 'decrease',
    },
    {
      id: 'waist_circumference',
      label: 'Cintura',
      unit: 'cm',
      direction: 'decrease',
    },
    {
      id: 'weekly_sessions',
      label: 'Sesiones por semana',
      unit: 'sesiones',
      direction: 'increase',
    },
    {
      id: 'resting_hr',
      label: 'Frecuencia cardiaca en reposo',
      unit: 'bpm',
      direction: 'decrease',
    },
  ],

  progression: {
    levels: [
      {
        levelId: 'safe_start',
        description: 'Arranque seguro con actividad viable y baja friccion',
        exitCriteria: [
          'Definir una rutina semanal realista',
          'Sostener 2 semanas sin molestias relevantes',
          'Registrar peso y medidas de partida',
        ],
      },
      {
        levelId: 'steady_base',
        description: 'Base estable con combinacion de cardio de bajo impacto y fuerza',
        exitCriteria: [
          'Completar 4 semanas de constancia',
          'Usar al menos 2 actividades viables distintas',
          'Mantener carga tolerable sin dolor creciente',
        ],
      },
      {
        levelId: 'sustainable_progress',
        description: 'Progresion sostenible sin atajos agresivos',
        exitCriteria: [
          'Mostrar una tendencia estable en peso o medidas',
          'Sostener el plan sin saltos bruscos de volumen',
          'Elegir la actividad mas viable sin perder continuidad',
        ],
      },
    ],
  },

  constraints: [
    {
      id: 'medical_context_first',
      description:
        'Si hay contexto medico, dolor persistente o medicacion relevante, validar la intensidad antes de subir carga.',
      severity: 'BLOCKER',
    },
    {
      id: 'low_impact_first',
      description:
        'Priorizar caminata, ciclismo suave o natacion antes de subir intensidad. La adherencia pesa mas que el castigo.',
      severity: 'BLOCKER',
    },
    {
      id: 'no_crash_changes',
      description:
        'Evitar recortes extremos o metas agresivas de corto plazo. La bajada sostenible tiene prioridad sobre la velocidad.',
      severity: 'WARNING',
    },
    {
      id: 'strength_support_recommended',
      description:
        'Agregar fuerza basica y movilidad al menos 1 vez por semana para sostener articulaciones y recuperacion.',
      severity: 'INFO',
    },
  ],

  sources: [
    {
      title: 'WHO, Guidelines on Physical Activity and Sedentary Behaviour',
      evidence: 'C_INDUSTRY_STANDARD',
    },
    {
      title: 'ACSM, exercise prescription position stands',
      evidence: 'C_INDUSTRY_STANDARD',
    },
    {
      title: 'BJSM reviews on progressive load and injury prevention',
      evidence: 'A_SYSTEMATIC_REVIEW',
    },
  ],

  generationMeta: {
    method: 'MANUAL',
    confidence: 0.9,
  },
};
