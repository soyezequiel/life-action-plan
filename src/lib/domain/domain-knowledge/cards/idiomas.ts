/**
 * Domain Knowledge Card — Idiomas / Language Learning
 *
 * Sources:
 *  - Krashen, "The Input Hypothesis: Issues and Implications" (B)
 *  - CEFR (Common European Framework of Reference for Languages), Council of Europe (C)
 *  - Ebbinghaus, "Über das Gedächtnis" — spaced repetition foundation (A)
 *  - Nation, "Learning Vocabulary in Another Language", Cambridge UP 2001 (A)
 *  - Arguelles & Koch, "Khatzumoto/AJATT: All Japanese All The Time" methodology (D)
 *  - Waring & Nation, "Second Language Reading and Incidental Vocabulary Learning" (B)
 */

import type { DomainKnowledgeCard } from '../bank';

export const idiomasCard: DomainKnowledgeCard = {
  domainLabel: 'idiomas',

  goalTypeCompatibility: ['SKILL_ACQUISITION', 'RECURRENT_HABIT', 'QUANT_TARGET_TRACKING'],

  // ─── Tasks / session types ─────────────────────────────────────────────
  tasks: [
    {
      id: 'lang_srs_review',
      label: 'Repaso espaciado (SRS: Anki, Duolingo, etc.)',
      typicalDurationMin: 15,
      tags: ['spaced-repetition', 'vocabulary', 'daily', 'retention'],
      equivalenceGroupId: 'language-vocabulary',
    },
    {
      id: 'lang_grammar_study',
      label: 'Estudio de gramática (reglas + ejercicios en contexto)',
      typicalDurationMin: 30,
      tags: ['grammar', 'structure', 'cognitive'],
      equivalenceGroupId: 'language-structure',
    },
    {
      id: 'lang_listening',
      label: 'Escucha comprensiva (podcasts, series, audiobooks)',
      typicalDurationMin: 30,
      tags: ['listening', 'input', 'comprehension', 'i+1'],
      equivalenceGroupId: 'language-input',
    },
    {
      id: 'lang_reading',
      label: 'Lectura extensiva (artículos, libros, subtítulos)',
      typicalDurationMin: 25,
      tags: ['reading', 'input', 'vocabulary', 'extensive'],
      equivalenceGroupId: 'language-input',
    },
    {
      id: 'lang_speaking_practice',
      label: 'Práctica oral (tutor, language exchange, shadowing)',
      typicalDurationMin: 30,
      tags: ['speaking', 'output', 'pronunciation', 'fluency'],
      equivalenceGroupId: 'language-speaking',
    },
    {
      id: 'lang_writing_practice',
      label: 'Escritura productiva (diario, correos, textos con feedback)',
      typicalDurationMin: 20,
      tags: ['writing', 'output', 'grammar', 'production'],
      equivalenceGroupId: 'language-structure',
    },
    {
      id: 'lang_shadowing',
      label: 'Shadowing (repetición sincronizada de audio nativo)',
      typicalDurationMin: 15,
      tags: ['pronunciation', 'prosody', 'shadowing', 'speaking'],
      equivalenceGroupId: 'language-speaking',
    },
    {
      id: 'lang_vocab_intensive',
      label: 'Vocabulario intensivo (listas temáticas + frecuencia)',
      typicalDurationMin: 20,
      tags: ['vocabulary', 'frequency-lists', 'intensive'],
      equivalenceGroupId: 'language-vocabulary',
    },
  ],

  // ─── Metrics ────────────────────────────────────────────────────────────
  metrics: [
    {
      id: 'vocab_size',
      label: 'Vocabulario activo estimado (palabras)',
      unit: 'palabras',
      direction: 'increase',
    },
    {
      id: 'weekly_input_hours',
      label: 'Horas semanales de input comprensible (escucha + lectura)',
      unit: 'horas',
      direction: 'increase',
    },
    {
      id: 'speaking_sessions_week',
      label: 'Sesiones de práctica oral por semana',
      unit: 'sesiones',
      direction: 'increase',
    },
    {
      id: 'srs_cards_mature',
      label: 'Tarjetas SRS "maduras" (intervalo ≥ 21 días)',
      unit: 'tarjetas',
      direction: 'increase',
    },
  ],

  // ─── Progression levels — CEFR ──────────────────────────────────────────
  progression: {
    levels: [
      {
        levelId: 'A1',
        description: 'Principiante absoluto: entiende frases muy básicas, se presenta y usa expresiones elementales',
        exitCriteria: [
          'Vocabulario activo ≥ 500 palabras de alta frecuencia',
          'Completar un test A1 reconocido con ≥ 70% de acierto',
          'Mantener una conversación de 2 minutos sobre temas familiares (nombre, país, profesión)',
        ],
      },
      {
        levelId: 'A2',
        description: 'Básico: comunica tareas simples cotidianas, entiende frases de áreas de necesidad inmediata',
        exitCriteria: [
          'Vocabulario activo ≥ 1,500 palabras',
          'Completar un test A2 con ≥ 70%',
          'Leer un texto de periódico simplificado con comprensión del 70%',
        ],
      },
      {
        levelId: 'B1',
        description: 'Independiente umbral: entiende temas familiares claros, viaja sin preparación, cuenta experiencias',
        exitCriteria: [
          'Vocabulario activo ≥ 3,000 palabras',
          'Completar un test B1 con ≥ 70%',
          'Ver un episodio de serie nativa con comprensión del 60% sin subtítulos',
        ],
      },
      {
        levelId: 'B2',
        description: 'Independiente avanzado: entiende temas complejos incluyendo técnicos, fluye con hablantes nativos',
        exitCriteria: [
          'Vocabulario activo ≥ 6,000 palabras',
          'Completar un test B2 o equivalente (DELE, DELF, FCE) con ≥ 70%',
          'Mantener una conversación de 15 min sobre tema abstracto sin pausas largas',
        ],
      },
      {
        levelId: 'C1',
        description: 'Dominio competente: usa el idioma con fluidez, espontaneidad, y precisión para fines sociales y profesionales',
        exitCriteria: [
          'Vocabulario activo ≥ 10,000 palabras',
          'Leer texto literario no adaptado con comprensión ≥ 80%',
          'Redactar un texto argumentativo de 400 palabras sin errores graves',
        ],
      },
    ],
  },

  // ─── Constraints ────────────────────────────────────────────────────────
  constraints: [
    {
      id: 'srs_daily_non_negotiable',
      description:
        'El repaso SRS (Anki u equivalente) debe realizarse DIARIAMENTE sin excepción. ' +
        'Saltear 2 días consecutivos duplica la deuda de tarjetas vencidas y puede llevar al abandono del mazo. ' +
        'Es la actividad de mayor ROI por minuto en aprendizaje de idiomas.',
      severity: 'BLOCKER',
    },
    {
      id: 'input_before_output_for_beginners',
      description:
        'Para niveles A1-A2: priorizar input comprensible (escucha + lectura) sobre output oral forzado. ' +
        'Según la hipótesis del input de Krashen, el output prematuro sin base de input produce fósiles fonológicos y gramaticales difíciles de corregir.',
      severity: 'BLOCKER',
    },
    {
      id: 'comprehensible_input_level',
      description:
        'El material de escucha/lectura debe ser "i+1": comprensible en un 95-98% del vocabulario. ' +
        'Material más difícil frustra sin aportar adquisición; más fácil no genera nuevo vocabulario en contexto.',
      severity: 'WARNING',
    },
    {
      id: 'speaking_minimum_b1',
      description:
        'Incluir al menos 1 sesión oral por semana a partir de nivel B1. ' +
        'El output oral activa mecanismos de nota (noticing) que el input pasivo no activa.',
      severity: 'WARNING',
    },
    {
      id: 'vocab_frequency_first',
      description:
        'El vocabulario nuevo debe priorizarse por frecuencia de uso en el idioma objetivo. ' +
        'Las 2,000 palabras más frecuentes cubren el 80% del texto cotidiano (Nation, 2001). ' +
        'No invertir tiempo en vocabulario de nicho antes de consolidar el top-2000.',
      severity: 'WARNING',
    },
    {
      id: 'max_new_cards_per_day',
      description:
        'No agregar más de 20 tarjetas SRS nuevas por día para evitar deuda de repaso inmanejable. ' +
        'El intervalo de deuda crece exponencialmente: 30 tarjetas/día = 3h/día de repaso en 6 meses.',
      severity: 'INFO',
    },
    {
      id: 'speaking_partner_recommended',
      description:
        'Se recomienda 1-2 sesiones semanales con hablante nativo o tutor desde nivel A2+. ' +
        'El feedback de pronunciación natural es irreemplazable por materiales grabados.',
      severity: 'INFO',
    },
  ],

  // ─── Sources ─────────────────────────────────────────────────────────────
  sources: [
    {
      title: 'Council of Europe, "Common European Framework of Reference for Languages (CEFR)", 2001 (updated 2018)',
      evidence: 'C_INDUSTRY_STANDARD',
    },
    {
      title: 'Krashen, S.D., "The Input Hypothesis: Issues and Implications", Longman, 1985',
      evidence: 'B_PEER_REVIEWED',
    },
    {
      title: 'Nation, I.S.P., "Learning Vocabulary in Another Language", Cambridge University Press, 2001',
      evidence: 'A_SYSTEMATIC_REVIEW',
    },
    {
      title: 'Ebbinghaus, H., "Über das Gedächtnis: Untersuchungen zur experimentellen Psychologie", 1885',
      evidence: 'A_SYSTEMATIC_REVIEW',
    },
    {
      title: 'Waring, R. & Nation, I.S.P., "Second Language Reading and Incidental Vocabulary Learning", Angles on the English-speaking World, 2004',
      evidence: 'B_PEER_REVIEWED',
    },
    {
      title: 'Arguelles, A. & Koch, A., "AJATT (All Japanese All The Time)" methodology, ajatt.com, 2006-2022',
      evidence: 'D_HEURISTIC',
    },
  ],

  generationMeta: {
    method: 'MANUAL',
    confidence: 0.90,
  },
};
