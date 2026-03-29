/**
 * Domain Knowledge Card - Cocina italiana
 *
 * Sources:
 *  - McGee, "On Food and Cooking" (C)
 *  - Samin Nosrat, "Salt, Fat, Acid, Heat" (C)
 *  - Marcella Hazan, Italian cooking foundations (D)
 *  - Modernist / classical pasta technique references (C)
 */

import type { DomainKnowledgeCard } from '../bank';

export const cocinaItalianaCard: DomainKnowledgeCard = {
  domainLabel: 'cocina-italiana',

  goalTypeCompatibility: ['SKILL_ACQUISITION', 'RECURRENT_HABIT', 'FINITE_PROJECT'],

  tasks: [
    {
      id: 'italian_reading',
      label: 'Estudiar una referencia concreta de cocina italiana',
      typicalDurationMin: 25,
      tags: ['reference', 'recipes', 'books', 'video', 'planning'],
      equivalenceGroupId: 'italian-reading-and-planning',
    },
    {
      id: 'italian_mise_en_place',
      label: 'Mise en place y tecnica base',
      typicalDurationMin: 20,
      tags: ['prep', 'technique', 'organization'],
      equivalenceGroupId: 'italian-technique-base',
    },
    {
      id: 'italian_pasta',
      label: 'Practica de pastas italianas',
      typicalDurationMin: 45,
      tags: ['pasta', 'dough', 'sauce', 'core'],
      equivalenceGroupId: 'italian-pasta-core',
    },
    {
      id: 'italian_sauces',
      label: 'Salsas base italianas',
      typicalDurationMin: 35,
      tags: ['sauce', 'tomato', 'emulsion', 'foundation'],
      equivalenceGroupId: 'italian-sauce-core',
    },
    {
      id: 'italian_plating',
      label: 'Emplatado, cata y ajuste de sabor',
      typicalDurationMin: 20,
      tags: ['tasting', 'plating', 'feedback'],
      equivalenceGroupId: 'italian-feedback-loop',
    },
  ],

  metrics: [
    {
      id: 'recipes_attempted',
      label: 'Recetas italianas intentadas',
      unit: 'recetas',
      direction: 'increase',
    },
    {
      id: 'pasta_dishes_consistent',
      label: 'Platos de pasta consistentes',
      unit: 'platos',
      direction: 'increase',
    },
    {
      id: 'book_sessions_week',
      label: 'Sesiones de estudio de referencias concretas por semana',
      unit: 'sesiones',
      direction: 'increase',
    },
  ],

  progression: {
    levels: [
      {
        levelId: 'principiante',
        description: 'Reconoce bases, sigue recetas y ejecuta pastas simples sin perderse',
        exitCriteria: [
          'Preparar 3 recetas de pasta con resultados repetibles',
          'Entender la logica de una receta escrita sin ayuda paso a paso',
          'Resolver mise en place y tiempos sin desorden critico',
        ],
      },
      {
        levelId: 'base',
        description: 'Cocina pastas y salsas base con control razonable',
        exitCriteria: [
          'Preparar una salsa de tomate y una emulsion simple',
          'Ajustar sal, textura y punto de coccion con criterio',
          'Elegir recetas desde referencias concretas y adaptarlas sin romper la tecnica',
        ],
      },
      {
        levelId: 'intermedio',
        description: 'Combina tecnicas y subtemas con autonomia creciente',
        exitCriteria: [
          'Alternar pastas secas, frescas y rellenas',
          'Planificar menus de 2-3 platos italianos',
          'Explicar por que una receta funciona o falla',
        ],
      },
    ],
  },

  constraints: [
    {
      id: 'books_before_improvisation',
      description:
        'Al comenzar, una referencia confiable y paso a paso debe guiar la practica. Puede ser receta escrita, libro o video tecnico; improvisar demasiado pronto suele degradar tecnica y sabor.',
      severity: 'BLOCKER',
    },
    {
      id: 'pasta_first_subtopic_alignment',
      description:
        'Si el subtema elegido es pastas, la mayor parte de la practica debe centrarse en pastas y salsas, no en platos sueltos sin continuidad.',
      severity: 'BLOCKER',
    },
    {
      id: 'reference_driven_progression',
      description:
        'Cada fase debe apoyar una referencia concreta: libro, receta, tecnica o plato especifico.',
      severity: 'WARNING',
    },
    {
      id: 'feedback_loop_recommended',
      description:
        'Conviene cerrar cada ciclo con cata y ajuste de sabor para evitar repetir errores.',
      severity: 'INFO',
    },
  ],

  sources: [
    {
      title: 'Harold McGee, On Food and Cooking',
      evidence: 'A_SYSTEMATIC_REVIEW',
    },
    {
      title: 'Samin Nosrat, Salt, Fat, Acid, Heat',
      evidence: 'C_INDUSTRY_STANDARD',
    },
    {
      title: 'Marcella Hazan, Essentials of Classic Italian Cooking',
      evidence: 'D_HEURISTIC',
    },
  ],

  generationMeta: {
    method: 'MANUAL',
    confidence: 0.9,
  },
};
