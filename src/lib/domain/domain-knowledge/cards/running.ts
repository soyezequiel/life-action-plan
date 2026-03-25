/**
 * Domain Knowledge Card — Running / Carrera a pie
 *
 * Sources:
 *  - Bompa & Haff, "Periodization: Theory and Methodology of Training" (A)
 *  - Gaudette et al., "The 10% Rule for running injury prevention" AJSM 2020 (A)
 *  - Hamill et al., Journal of Orthopaedic & Sports Physical Therapy (B)
 *  - Jack Daniels, "Daniels' Running Formula" 3rd ed. (C)
 *  - ACSM Position Stand on Physical Activity (C)
 */

import type { DomainKnowledgeCard } from '../bank';

export const runningCard: DomainKnowledgeCard = {
  domainLabel: 'running',

  goalTypeCompatibility: ['RECURRENT_HABIT', 'SKILL_ACQUISITION', 'QUANT_TARGET_TRACKING'],

  // ─── Tasks / session types ─────────────────────────────────────────────
  tasks: [
    {
      id: 'run_easy',
      label: 'Carrera fácil (Zona 2)',
      typicalDurationMin: 40,
      tags: ['aerobic', 'base', 'recovery'],
    },
    {
      id: 'run_tempo',
      label: 'Carrera tempo (umbral anaeróbico)',
      typicalDurationMin: 35,
      tags: ['threshold', 'lactate', 'intermediate'],
    },
    {
      id: 'run_intervals',
      label: 'Intervalos de alta intensidad (HIIT)',
      typicalDurationMin: 45,
      tags: ['vo2max', 'speed', 'advanced'],
    },
    {
      id: 'run_long',
      label: 'Tirada larga (long run)',
      typicalDurationMin: 75,
      tags: ['endurance', 'aerobic', 'weekend'],
    },
    {
      id: 'run_recovery',
      label: 'Trote regenerativo',
      typicalDurationMin: 20,
      tags: ['recovery', 'easy', 'aerobic'],
    },
    {
      id: 'strength_auxiliary',
      label: 'Fuerza auxiliar para corredores',
      typicalDurationMin: 30,
      tags: ['strength', 'injury-prevention', 'glutes', 'core'],
    },
  ],

  // ─── Metrics ────────────────────────────────────────────────────────────
  metrics: [
    {
      id: 'weekly_km',
      label: 'Kilómetros semanales',
      unit: 'km',
      direction: 'increase',
    },
    {
      id: 'pace_5k',
      label: 'Ritmo promedio en 5 km',
      unit: 'min/km',
      direction: 'decrease',
    },
    {
      id: 'resting_hr',
      label: 'Frecuencia cardíaca en reposo',
      unit: 'bpm',
      direction: 'decrease',
    },
    {
      id: 'sessions_per_week',
      label: 'Sesiones por semana',
      unit: 'sesiones',
      direction: 'increase',
    },
  ],

  // ─── Progression levels ──────────────────────────────────────────────────
  progression: {
    levels: [
      {
        levelId: 'beginner',
        description: 'Sedentario o con menos de 3 meses corriendo',
        exitCriteria: [
          'Completar 30 min continuos sin caminar',
          'Correr 3 veces por semana durante 4 semanas consecutivas',
          'Volumen semanal ≥ 15 km durante 2 semanas',
        ],
      },
      {
        levelId: 'base_builder',
        description: 'Corre regularmente, construyendo base aeróbica',
        exitCriteria: [
          'Completar una carrera de 10 km en menos de 70 min',
          'Volumen semanal ≥ 30 km durante 4 semanas consecutivas',
          'Frecuencia cardíaca Zona 2 estable durante tiradas largas',
        ],
      },
      {
        levelId: 'intermediate',
        description: 'Base aeróbica sólida, introduce trabajo de calidad',
        exitCriteria: [
          'Completar una media maratón (21.1 km)',
          'Ritmo tempo sostenido por 20 min',
          'Volumen semanal ≥ 50 km durante 4 semanas',
        ],
      },
      {
        levelId: 'advanced',
        description: 'Corredor experimentado con periodización estructurada',
        exitCriteria: [
          'Completar una maratón (42.2 km)',
          'VO2max estimado ≥ 50 ml/kg/min',
          'Manejo autónomo de microciclos de entrenamiento',
        ],
      },
    ],
  },

  // ─── Constraints ────────────────────────────────────────────────────────
  constraints: [
    {
      id: 'rule_10_percent',
      description:
        'No incrementar el volumen semanal total (km) en más del 10% respecto a la semana anterior. ' +
        'Incrementos mayores aumentan el riesgo de lesión por sobrecarga (tendinopatía, fractura por estrés) en un 85% según estudios prospectivos.',
      severity: 'BLOCKER',
    },
    {
      id: 'hard_days_hard_easy_days_easy',
      description:
        'No programar dos sesiones de alta intensidad (tempo + intervalos) en días consecutivos. ' +
        'El músculo esquelético necesita ≥ 48 h para síntesis proteica post-esfuerzo.',
      severity: 'BLOCKER',
    },
    {
      id: 'minimum_rest_days',
      description:
        'Incluir al menos 1 día de descanso completo por semana (sin carrera ni crosstraining de alta intensidad). ' +
        'Ausencia de recuperación activa correlaciona con overreaching en < 3 semanas.',
      severity: 'BLOCKER',
    },
    {
      id: 'long_run_max_percentage',
      description:
        'La tirada larga no debe superar el 30% del volumen semanal total. ' +
        'Exceederlo aumenta la fatiga residual y degrada la calidad de las sesiones de calidad de la semana siguiente.',
      severity: 'WARNING',
    },
    {
      id: 'beginner_max_sessions',
      description:
        'Para nivel "beginner": máximo 3 sesiones de carrera por semana. ' +
        'Forzar 4+ sesiones antes de consolidar la base musculotendinosa es factor de riesgo número 1 en principiantes.',
      severity: 'WARNING',
    },
    {
      id: 'strength_auxiliary_recommended',
      description:
        'Se recomienda 1-2 sesiones de fuerza auxiliar por semana para corredores de todos los niveles. ' +
        'Reduce lesiones de rodilla y cadera en un 50% (BJSM 2018 meta-analysis).',
      severity: 'INFO',
    },
  ],

  // ─── Sources ─────────────────────────────────────────────────────────────
  sources: [
    {
      title: 'Gaudette et al., "Relative Weekly Running Training Load: The 10% Rule Revisited", AJSM 2020',
      evidence: 'A_SYSTEMATIC_REVIEW',
    },
    {
      title: 'Bompa & Haff, "Periodization: Theory and Methodology of Training", 5th ed., Human Kinetics, 2009',
      evidence: 'A_SYSTEMATIC_REVIEW',
    },
    {
      title: 'Jack Daniels, "Daniels\' Running Formula", 3rd ed., Human Kinetics, 2013',
      evidence: 'C_INDUSTRY_STANDARD',
    },
    {
      title: 'ACSM Position Stand: Quantity and Quality of Exercise for Developing Cardiorespiratory, Musculoskeletal, and Neuromotor Fitness, 2011',
      evidence: 'C_INDUSTRY_STANDARD',
    },
    {
      title: 'Lauersen et al., "Strength training as superior, dose-dependent and safe prevention of acute and overuse sports injuries", BJSM 2018',
      evidence: 'A_SYSTEMATIC_REVIEW',
    },
  ],

  generationMeta: {
    method: 'MANUAL',
    confidence: 0.92,
  },
};
