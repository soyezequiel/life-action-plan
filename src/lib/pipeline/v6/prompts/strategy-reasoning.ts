import type { DomainKnowledgeCard } from '../../../domain/domain-knowledge/bank';

export interface StrategyGoalInterpretation {
  parsedGoal: string;
  implicitAssumptions: string[];
}

export interface StrategyCriticFinding {
  severity: 'critical' | 'warning' | 'info';
  category: 'feasibility' | 'specificity' | 'progression' | 'scheduling' | 'motivation' | 'domain';
  message: string;
  suggestion: string | null;
  affectedPhaseIds: string[];
}

export interface StrategyDomainContext {
  card: DomainKnowledgeCard | null;
  specificAdvice?: string | null;
  warnings?: string[];
}

export interface StrategyPromptInput {
  goalText: string;
  goalType: string;
  interpretation: StrategyGoalInterpretation;
  userProfile: {
    freeHoursWeekday: number;
    freeHoursWeekend: number;
    energyLevel: string;
    fixedCommitments: string[];
  };
  domainContext: StrategyDomainContext | null;
  clarificationAnswers: Record<string, string>;
  previousCriticFindings?: StrategyCriticFinding[];
  revisionContext?: string;
}

function formatAnswers(answers: Record<string, string>): string {
  const entries = Object.entries(answers);
  if (entries.length === 0) return 'Ninguna respuesta adicional.';
  return entries.map(([key, value]) => `- ${key}: ${value}`).join('\n');
}

function formatDomainContext(domainContext: StrategyDomainContext | null): string {
  if (!domainContext?.card) {
    const warnings = domainContext?.warnings?.length
      ? `\nAdvertencias de dominio: ${domainContext.warnings.join(' | ')}`
      : '';
    return `No hay conocimiento de dominio especializado disponible. Usa mejores practicas generales.${warnings}`;
  }

  const { card } = domainContext;
  const parts: string[] = [`Dominio: ${card.domainLabel}`];

  if (card.tasks.length > 0) {
    parts.push(`Tareas tipicas: ${card.tasks.map((task) => task.label).join(', ')}`);
  }

  if (card.progression?.levels && card.progression.levels.length > 0) {
    parts.push(`Progresion: ${card.progression.levels.map((level) => level.description).join(' -> ')}`);
    parts.push(`Criterios de salida por nivel: ${card.progression.levels.map((level) => `${level.levelId}: ${level.exitCriteria.join('; ')}`).join(' | ')}`);
  }

  if (card.tasks.length > 0) {
    const durations = card.tasks.map((task) => task.typicalDurationMin);
    parts.push(`Duracion tipica de sesion: ${Math.min(...durations)}-${Math.max(...durations)} minutos`);
  }

  if (domainContext.specificAdvice) {
    parts.push(`Consejo puntual del experto: ${domainContext.specificAdvice}`);
  }

  if (domainContext.warnings && domainContext.warnings.length > 0) {
    parts.push(`Advertencias de dominio: ${domainContext.warnings.join(' | ')}`);
  }

  return parts.join('\n');
}

function buildScopeAlignmentGuidance(goalText: string, clarificationAnswers: Record<string, string>): string {
  const normalizedGoal = goalText.toLowerCase();
  const normalizedAnswers = Object.values(clarificationAnswers).join(' ').toLowerCase();
  const isBroadItalianCookingGoal = /\bitalian[oa]s?\b/.test(normalizedGoal)
    && /\b(cocina|cocinar|plato|platos|receta|recetas|gastronom)\b/.test(normalizedGoal)
    && !/\b(pasta|pastas|pizza|pizzas|risotto|gnocchi|lasagna|ravioli|postre|postres)\b/.test(normalizedGoal);
  const hasSpecificSubtopic = /\b(pizza|pizzas|risotto|gnocchi|lasagna|ravioli|salsa|salsas)\b/.test(normalizedAnswers);

  if (!isBroadItalianCookingGoal || !hasSpecificSubtopic) {
    return '';
  }

  return `
## ALCANCE DEL OBJETIVO

El subtema elegido por el usuario es una puerta de entrada, NO un reemplazo del objetivo principal.
Si el objetivo sigue siendo "cocina italiana" amplia, el plan debe conservar la base exigida por la progresion del dominio aunque arranque por un subtema especifico.
Ejemplo: si el usuario dice "pizzas" primero, puedes usar pizza como motivacion inicial, pero no debes convertir todo el plan en pizza si la progresion del dominio exige tambien base de pastas o salsas.
`;
}

function formatCriticFindings(findings: StrategyCriticFinding[]): string {
  return findings
    .map((finding, index) => {
      const parts = [`${index + 1}. [${finding.severity}/${finding.category}] ${finding.message}`];
      if (finding.suggestion) {
        parts.push(`   Sugerencia: ${finding.suggestion}`);
      }
      if (finding.affectedPhaseIds.length > 0) {
        parts.push(`   Fases afectadas: ${finding.affectedPhaseIds.join(', ')}`);
      }
      return parts.join('\n');
    })
    .join('\n');
}

function extractHorizonMonths(answers: Record<string, string>, goalText: string): number | null {
  const text = `${goalText} ${Object.values(answers).join(' ')}`.toLowerCase();

  const yearMatch = text.match(/(\d+)\s*(año|años|ano|anos|year|years)\b/);
  if (yearMatch) return Math.min(Number(yearMatch[1]) * 12, 24);

  const monthMatch = text.match(/(\d+)\s*(mes|meses|month|months)\b/);
  if (monthMatch) return Math.max(1, Number(monthMatch[1]));

  const weekMatch = text.match(/(\d+)\s*(semana|semanas|week|weeks)\b/);
  if (weekMatch) return Math.max(1, Math.ceil(Number(weekMatch[1]) / 4));

  return null;
}

export function buildStrategyPrompt(input: StrategyPromptInput): string {
  const {
    goalText,
    goalType,
    interpretation,
    userProfile,
    domainContext,
    clarificationAnswers,
    previousCriticFindings,
    revisionContext,
  } = input;

  const totalAvailableHours = (userProfile.freeHoursWeekday * 5) + (userProfile.freeHoursWeekend * 2);
  const horizonMonths = extractHorizonMonths(clarificationAnswers, goalText);
  const scopeAlignmentBlock = buildScopeAlignmentGuidance(goalText, clarificationAnswers);
  const revisionBlock = previousCriticFindings && previousCriticFindings.length > 0
    ? `
## REVISION OBLIGATORIA - La revision anterior encontro estos problemas:
${formatCriticFindings(previousCriticFindings)}
DEBES abordar cada problema. Para cada hallazgo, explica que cambiaste y por que.
${revisionContext ? `\nResumen estructurado del critico:\n${revisionContext}\n` : ''}
`
    : '';

  const horizonBlock = horizonMonths
    ? `
## RESTRICCION DE HORIZONTE

El usuario pidio un plazo de ${horizonMonths} mes(es). Esta restriccion es OBLIGATORIA:
- totalMonths debe ser <= ${horizonMonths}
- Todas las fases deben tener endMonth <= ${horizonMonths}
- Si no cabe todo en ${horizonMonths} mes(es), REDUCE el alcance. NUNCA extiendas el plazo mas alla de ${horizonMonths} mes(es).
`
    : '';

  const timeStepOverflow = horizonMonths
    ? `Si lo excede, reduce el alcance. NUNCA extiendas el cronograma mas alla del horizonte de ${horizonMonths} mes(es).`
    : 'Si lo excede, extiende el cronograma o reduce el alcance.';

  return `Estas creando un plan estrategico para un objetivo personal.

## Contexto
Objetivo: ${goalText}
Tipo: ${goalType}
Interpretacion del usuario: ${interpretation.parsedGoal}
Supuestos implicitos confirmados: ${interpretation.implicitAssumptions.join(', ') || 'Ninguno'}

## Perfil del usuario
- Horas libres entre semana: ${userProfile.freeHoursWeekday}h
- Horas libres fin de semana: ${userProfile.freeHoursWeekend}h
- Nivel de energia: ${userProfile.energyLevel}
- Compromisos fijos: ${userProfile.fixedCommitments.join(', ') || 'Ninguno'}
- Contexto adicional del usuario:
${formatAnswers(clarificationAnswers)}

## Conocimiento de dominio
${formatDomainContext(domainContext)}
${scopeAlignmentBlock}${revisionBlock}${horizonBlock}
## Reglas de nombres de fase

NUNCA uses nombres de fase genericos como "Fase 1", "Base", "Fundamentos", "Introduccion", "Consolidacion", "Avance", "Nivel 1", "Nivel 2".
Cada titulo de fase DEBE incluir el tema especifico del usuario. Ejemplos correctos:
- "Primer repertorio de pastas italianas con videos de referencia"
- "Repeticion guiada de salsas clasicas hasta dominar la consistencia"
- "Menu completo italiano con ejecucion autonoma"
Ejemplos INCORRECTOS que seran rechazados:
- "Base" / "Fundamentos" / "Fase 1" / "Introduccion" / "Consolidacion"

## Tu tarea

## Requisitos de vocabulario en las fases

IMPORTANTE: Si el contexto del usuario incluye un subtema especifico, un nivel actual o un horizonte temporal, cada fase debe mencionar esos datos explicitamente en su titulo o en su resumen. Ejemplos validos: "pizza", "principiante", "6 meses", "seis meses", "medio ano".

Piensa en esto sistematicamente:

Paso 1 - DESCOMPOSICION: Divide el objetivo en 3-6 fases distintas. Cada fase debe tener un enfoque claro y un criterio de salida medible.

Paso 2 - SECUENCIACION: Ordena las fases considerando dependencias y motivacion. Pon las fases de fundamentos primero. Coloca las fases mas dificiles despues de que el usuario haya ganado impulso.

Paso 3 - ASIGNACION DE TIEMPO: Para cada fase, estima las horas/semana necesarias. El total de fases superpuestas no debe exceder ${totalAvailableHours}h/semana. ${timeStepOverflow}

Paso 4 - HITOS: Cada fase recibe exactamente un hito. El hito debe ser observable y binario.

Paso 5 - REVISION DE RIESGOS: Para cada fase, identifica el modo de fallo mas probable y como mitigarlo.

Despues de razonar los 5 pasos, produce el plan como JSON:
{
  "title": "titulo del plan en espanol",
  "summary": "resumen de 2-3 oraciones en espanol",
  "totalMonths": number,${horizonMonths ? ` // MAXIMO ${horizonMonths}` : ''}
  "estimatedWeeklyHours": number,
  "phases": [{
    "id": "phase-N",
    "title": "en espanol",
    "summary": "en espanol",
    "goalIds": [],
    "startMonth": number,${horizonMonths ? ` // >= 1` : ''}
    "endMonth": number,${horizonMonths ? ` // <= ${horizonMonths} (OBLIGATORIO)` : ''}
    "hoursPerWeek": number,
    "milestone": "criterio medible en espanol",
    "metrics": ["que rastrear"],
    "dependencies": ["phase-id"],
    "failureMode": "forma mas probable en que esta fase falla",
    "mitigation": "como prevenirlo"
  }],
  "milestones": [{ "id": "m-N", "label": "en espanol", "targetMonth": number,${horizonMonths ? ` // <= ${horizonMonths}` : ''} "phaseId": "phase-N" }],
  "conflicts": [{ "description": "en espanol", "resolution": "en espanol" }]
}

Responde SOLO con el razonamiento paso a paso seguido del bloque JSON. No uses markdown para envolver el JSON.`;
}
