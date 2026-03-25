/**
 * Domain Knowledge Card — Guitarra / Guitar
 *
 * Sources:
 *  - Ericsson & Pool, "Peak: Secrets from the New Science of Expertise" (A)
 *  - Cepeda et al., "Distributed Practice in Verbal Recall Tasks" Psych Bull 2006 (A)
 *  - Coyle, "The Talent Code" (C)
 *  - Guitar Institute of Technology curriculum guidelines (C)
 *  - Troy Grady, "Cracking the Code" practice methodology (D)
 */

import type { DomainKnowledgeCard } from '../bank';

export const guitarraCard: DomainKnowledgeCard = {
  domainLabel: 'guitarra',

  goalTypeCompatibility: ['SKILL_ACQUISITION', 'RECURRENT_HABIT', 'IDENTITY_EXPLORATION'],

  // ─── Tasks / session types ─────────────────────────────────────────────
  tasks: [
    {
      id: 'guitar_warmup',
      label: 'Calentamiento técnico (escalas lentas + cromáticos)',
      typicalDurationMin: 10,
      tags: ['warmup', 'technique', 'daily'],
    },
    {
      id: 'guitar_technique',
      label: 'Práctica técnica enfocada (técnica específica)',
      typicalDurationMin: 20,
      tags: ['deliberate-practice', 'technique', 'focused'],
    },
    {
      id: 'guitar_repertoire',
      label: 'Aprendizaje de repertorio (canción o fragmento)',
      typicalDurationMin: 25,
      tags: ['repertoire', 'songs', 'musicality'],
    },
    {
      id: 'guitar_theory',
      label: 'Teoría musical y armonía aplicada',
      typicalDurationMin: 20,
      tags: ['theory', 'harmony', 'cognitive'],
    },
    {
      id: 'guitar_ear_training',
      label: 'Entrenamiento auditivo (solfeo, intervalos, transcripción)',
      typicalDurationMin: 15,
      tags: ['ear-training', 'aural', 'musicianship'],
    },
    {
      id: 'guitar_improv',
      label: 'Improvisación libre o sobre backing track',
      typicalDurationMin: 20,
      tags: ['improvisation', 'creativity', 'expression'],
    },
    {
      id: 'guitar_review',
      label: 'Repaso espaciado de material anterior',
      typicalDurationMin: 15,
      tags: ['spaced-repetition', 'review', 'consolidation'],
    },
  ],

  // ─── Metrics ────────────────────────────────────────────────────────────
  metrics: [
    {
      id: 'daily_practice_min',
      label: 'Minutos de práctica deliberada por día',
      unit: 'min',
      direction: 'increase',
    },
    {
      id: 'songs_learned',
      label: 'Canciones/fragmentos dominados (sin mirar partitura)',
      unit: 'canciones',
      direction: 'increase',
    },
    {
      id: 'bpm_target_scale',
      label: 'BPM alcanzados en escala de referencia (tempo metrónomo)',
      unit: 'BPM',
      direction: 'increase',
    },
    {
      id: 'streak_days',
      label: 'Días consecutivos de práctica',
      unit: 'días',
      direction: 'increase',
    },
  ],

  // ─── Progression levels ──────────────────────────────────────────────────
  progression: {
    levels: [
      {
        levelId: 'principiante',
        description: 'Primer contacto con el instrumento, aprendiendo postura, acordes básicos y cambios simples',
        exitCriteria: [
          'Tocar 3 acordes abiertos (Am, E, G) con transiciones fluidas a 60 BPM',
          'Strumming pattern 1-2-3-4 constante por 2 minutos sin pausas',
          'Completar 30 días de práctica acumulada (no necesariamente consecutivos)',
        ],
      },
      {
        levelId: 'basico_intermedio',
        description: 'Acordes abiertos consolidados, empieza a trabajar cejilla y escala pentatónica',
        exitCriteria: [
          'Cejilla en el traste 1 con seis cuerdas limpias a 80 BPM',
          'Escala pentatónica menor en posición 1 a 100 BPM (sin errores)',
          'Tocar 5 canciones completas de principio a fin',
        ],
      },
      {
        levelId: 'intermedio',
        description: 'Domina el diapasón en primeras 7 posiciones, trabaja teoría y improvisación básica',
        exitCriteria: [
          'Improvisar sobre progressión I-IV-V en Do mayor de forma coherente',
          'Leer cifrado de acordes y tablatura sin ayuda externa',
          'Escala mayor en 3 posiciones del diapasón a 120 BPM',
        ],
      },
      {
        levelId: 'avanzado',
        description: 'Técnicas extendidas, dominio del diapasón completo, arreglos propios',
        exitCriteria: [
          'Transcribir un solo de referencia de oído',
          'Tocar en tiempo una progresión de jazz (ii-V-I) con arpegios',
          'Crear un arreglo propio de una canción conocida',
        ],
      },
    ],
  },

  // ─── Constraints ────────────────────────────────────────────────────────
  constraints: [
    {
      id: 'distributed_practice_required',
      description:
        'La práctica distribuida (sesiones cortas diarias) produce retención a largo plazo ' +
        'significativamente mayor que la práctica masiva (una sesión larga semanal). ' +
        '20–30 min/día superan a 3 h un solo día. ' +
        'No programar sesiones de guitarra únicamente en fines de semana.',
      severity: 'BLOCKER',
    },
    {
      id: 'deliberate_over_passive',
      description:
        'Cada sesión debe tener un objetivo técnico concreto y medible (e.g., "tempo 90 BPM sin errores"). ' +
        'La práctica "tocar por tocar" sin intención no produce mejora técnica según la teoría del aprendizaje deliberado (Ericsson).',
      severity: 'BLOCKER',
    },
    {
      id: 'max_daily_practice_beginner',
      description:
        'Para nivel "principiante": no superar 45 min de práctica diaria. ' +
        'El sobreentrenamiento en principiantes produce frustración y tendinitis en mano derecha/izquierda. ' +
        'La calidad de atención decae pasados los 30-45 min de práctica deliberada.',
      severity: 'WARNING',
    },
    {
      id: 'spaced_review_sessions',
      description:
        'Incluir al menos 1 sesión de repaso espaciado por semana del material de las 2-4 semanas anteriores. ' +
        'Sin revisión, la curva del olvido de Ebbinghaus elimina el 70% del material en 7 días.',
      severity: 'WARNING',
    },
    {
      id: 'rest_between_sessions',
      description:
        'Para sesiones de más de 60 min (niveles intermedio+): incluir pausa de 10 min mínimo. ' +
        'El aprendizaje motor motor skill consolida durante los intervalos de descanso (offline learning).',
      severity: 'INFO',
    },
    {
      id: 'ear_training_recommended',
      description:
        'Incluir entrenamiento auditivo al menos 2 veces por semana. ' +
        'Es el factor predictor más fuerte de progreso musical a largo plazo según estudios de conservatorio.',
      severity: 'INFO',
    },
  ],

  // ─── Sources ─────────────────────────────────────────────────────────────
  sources: [
    {
      title: 'Ericsson, K.A., Krampe, R.T., Tesch-Römer, C., "The Role of Deliberate Practice in the Acquisition of Expert Performance", Psych Review 1993',
      evidence: 'A_SYSTEMATIC_REVIEW',
    },
    {
      title: 'Cepeda, N.J. et al., "Distributed Practice in Verbal Recall Tasks: A Review and Quantitative Synthesis", Psychological Bulletin 2006',
      evidence: 'A_SYSTEMATIC_REVIEW',
    },
    {
      title: 'Coyle, D., "The Talent Code: Greatness Isn\'t Born, It\'s Grown", Bantam Books, 2009',
      evidence: 'C_INDUSTRY_STANDARD',
    },
    {
      title: 'Guitar Institute of Technology (Musicians Institute), Curriculum Guidelines, Level I-IV',
      evidence: 'C_INDUSTRY_STANDARD',
    },
    {
      title: 'Troy Grady, "Cracking the Code: Speed Picking and Technique Development", troygrady.com, 2020',
      evidence: 'D_HEURISTIC',
    },
  ],

  generationMeta: {
    method: 'MANUAL',
    confidence: 0.88,
  },
};
