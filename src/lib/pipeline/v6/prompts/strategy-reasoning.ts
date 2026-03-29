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

const METRIC_REFERENCE_PATTERN = /\b\d+(?:[.,]\d+)?k?\s*(?:usd|us\$|dolar(?:es)?|kg|kilos?|lb|lbs|cm|m|%|por ciento|paginas?|libros?|veces?|clientes?|entrevistas?)\b/i;
const HORIZON_REFERENCE_PATTERNS = [
  /\b\d+\s*(?:a[nñ]o|a[nñ]os|ano|anos|mes|meses|semana|semanas|year|years|month|months|week|weeks)\b/i,
  /\b(?:medio ano|medio a[nñ]o|half year|one year|a year|fin de ano|fin de a[nñ]o)\b/i,
];

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

function buildClarificationAlignmentGuidance(clarificationAnswers: Record<string, string>): string {
  if (Object.keys(clarificationAnswers).length === 0) {
    return '';
  }

  return `
## ANCLAJES DEL INTAKE

Antes de escribir el plan, identifica y preserva los datos mas concretos del intake:
- metricas, numeros o resultados medibles;
- plazo u horizonte;
- via preferida para lograr el objetivo;
- recursos, experiencia o activos ya disponibles;
- restricciones reales.

El plan debe seguir respondiendo al mismo problema original despues de incorporar esas aclaraciones.
Si las fases podrian servir para otro objetivo distinto, o cambian el mecanismo causal sin explicarlo, el plan esta mal alineado.
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

function parseHorizonMonths(text: string): number | null {
  const normalizedText = text.toLowerCase();

  const yearMatch = normalizedText.match(/(\d+)\s*(año|años|ano|anos|year|years)\b/);
  if (yearMatch) return Math.min(Number(yearMatch[1]) * 12, 24);

  const monthMatch = normalizedText.match(/(\d+)\s*(mes|meses|month|months)\b/);
  if (monthMatch) return Math.max(1, Number(monthMatch[1]));

  const weekMatch = normalizedText.match(/(\d+)\s*(semana|semanas|week|weeks)\b/);
  if (weekMatch) return Math.max(1, Math.ceil(Number(weekMatch[1]) / 4));

  return null;
}

function extractHorizonMonths(answers: Record<string, string>, goalText: string): number | null {
  const explicitHorizon = answers['senal tipada - general: plazo']
    ?? answers['senal tipada - cocina: horizonte']
    ?? null;

  if (explicitHorizon) {
    const explicitMonths = parseHorizonMonths(explicitHorizon);
    if (explicitMonths) {
      return explicitMonths;
    }
  }

  return parseHorizonMonths(`${goalText} ${Object.values(answers).join(' ')}`);
}

function extractLiteralReference(
  values: string[],
  patterns: RegExp[],
  options?: { preferWholeValue?: boolean },
): string | null {
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (!match) {
        continue;
      }

      if (options?.preferWholeValue && trimmed.length <= 120) {
        return trimmed;
      }

      return match[0].trim();
    }
  }

  return null;
}

function extractMetricReference(goalText: string, answers: Record<string, string>): string | null {
  return extractLiteralReference(
    [goalText, ...Object.values(answers)],
    [METRIC_REFERENCE_PATTERN],
    { preferWholeValue: true },
  );
}

function extractExplicitHorizonText(goalText: string, answers: Record<string, string>): string | null {
  const typedHorizon = answers['senal tipada - general: plazo']
    ?? answers['senal tipada - cocina: horizonte']
    ?? null;

  if (typedHorizon?.trim()) {
    return typedHorizon.trim();
  }

  return extractLiteralReference(
    [goalText, ...Object.values(answers)],
    HORIZON_REFERENCE_PATTERNS,
    { preferWholeValue: true },
  );
}

function extractPreferredPath(answers: Record<string, string>): string | null {
  const preferredEntry = Object.entries(answers).find(([key, value]) =>
    Boolean(value.trim())
      && !key.toLowerCase().includes('senal tipada')
      && /\b(via|metodo|modo|como|canal|ruta|estrategia|enfoque|stack|medio|palanca)\b/i.test(key),
  );

  return preferredEntry?.[1]?.trim() || null;
}

function buildInvariantChecklist(
  goalText: string,
  interpretation: StrategyGoalInterpretation,
  clarificationAnswers: Record<string, string>,
  domainContext: StrategyDomainContext | null,
  totalAvailableHours: number,
): string {
  const metricReference = extractMetricReference(goalText, clarificationAnswers);
  const explicitHorizonText = extractExplicitHorizonText(goalText, clarificationAnswers);
  const preferredPath = extractPreferredPath(clarificationAnswers);
  const domainLine = domainContext?.card
    ? `- Dominio confirmado: "${domainContext.card.domainLabel}". No lo reemplaces por otro dominio ni por otro mecanismo causal.`
    : '- Dominio confirmado: no hay dominio especializado confirmado. No inventes profesiones, industrias, mercados ni disciplinas.';
  const metricLine = metricReference
    ? `- Metrica literal a preservar: "${metricReference}". No cambies cifra, unidad, moneda ni cadencia.`
    : '- Metrica literal a preservar: no hay una metrica numerica explicita. No inventes una.';
  const horizonLine = explicitHorizonText
    ? `- Horizonte literal a preservar: "${explicitHorizonText}". No lo extiendas, no lo diluyas y no lo conviertas en un plazo mas vago.`
    : '- Horizonte literal a preservar: no hay horizonte explicito. No inventes uno.';
  const preferredPathLine = preferredPath
    ? `- Via o palanca explicitada: "${preferredPath}". No la sustituyas por otra.`
    : '- Via o palanca explicitada: si no existe una en el intake, no inventes el mecanismo causal; senala el faltante si bloquea la ejecutabilidad.';

  return `
## CHECKLIST DE INVARIANTES

Debes conservar estos invariantes sin degradarlos:
- Meta literal: "${goalText}"
- Interpretacion operativa valida: "${interpretation.parsedGoal}"
${metricLine}
${horizonLine}
${preferredPathLine}
- Disponibilidad maxima real: ${totalAvailableHours}h/semana. No disenes una carga imposible.
${domainLine}
`;
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
  const clarificationAlignmentBlock = buildClarificationAlignmentGuidance(clarificationAnswers);
  const invariantChecklistBlock = buildInvariantChecklist(
    goalText,
    interpretation,
    clarificationAnswers,
    domainContext,
    totalAvailableHours,
  );
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
${clarificationAlignmentBlock}
${invariantChecklistBlock}
## POLITICA DE EJECUTABILIDAD

Cada fase debe ser ejecutable, no solo criticable. Eso significa que cada fase debe dejar claro:
- que hace el usuario;
- sobre que activo, canal o practica concreta trabaja;
- que salida observable produce;
- como se decide si puede pasar a la siguiente fase.

Si una fase podria reutilizarse casi igual para otro objetivo distinto, es demasiado generica.
Verbos vacios prohibidos si no van anclados a una salida concreta: "explorar", "mejorar", "avanzar", "consolidar", "optimizar", "crecer", "practicar".

## Reglas de nombres de fase

NUNCA uses nombres de fase genericos como "Fase 1", "Base", "Fundamentos", "Introduccion", "Consolidacion", "Avance", "Nivel 1", "Nivel 2".
Cada titulo de fase DEBE incluir el tema especifico del usuario. Ejemplos correctos:
- "Primer repertorio de pastas italianas con videos de referencia"
- "Repeticion guiada de salsas clasicas hasta dominar la consistencia"
- "Menu completo italiano con ejecucion autonoma"
Ejemplos INCORRECTOS que seran rechazados:
- "Base" / "Fundamentos" / "Fase 1" / "Introduccion" / "Consolidacion"

## EJEMPLOS BUENOS / MALOS

BUENO - preservar meta, metrica y via:
- Objetivo: "generar 3k USD por mes con empleo remoto en 12 meses"
- Fase: "Portfolio y postulaciones React/Python para empleo remoto rumbo a 3k USD/mes"
- Motivo: mantiene la cifra, la via y el resultado esperado.

MALO - degradar la meta original:
- Objetivo: "generar 3k USD por mes con empleo remoto en 12 meses"
- Fase: "Construir presencia online y explorar ingresos digitales"
- Motivo: borra la metrica, cambia la via y no define una salida ejecutable.

BUENO - conservar la amplitud real del dominio:
- Objetivo: "aprender cocina italiana", subtema inicial: "pizza"
- Fase: "Base de masas, salsas y pasta corta para cocina italiana con entrada por pizza"
- Motivo: pizza funciona como puerta de entrada sin borrar pasta o salsas.

MALO - inventar dominio o negocio:
- Objetivo: "aprender cocina italiana"
- Fase: "Lanzar un microemprendimiento de pizzas por Instagram"
- Motivo: inventa negocio, canal comercial y un dominio distinto al pedido.

BUENO - senal clara ante faltante critico:
- Self-check: "datos_criticos: missing - falta la via principal para monetizar sin inventar el plan"
- Conflicto: "Falta definir el mecanismo principal antes de detallar fases de monetizacion"

MALO - improvisar un faltante critico:
- Inventar "freelance B2B", "agencia" o "YouTube" si el intake no lo menciona.

## Requisitos de vocabulario en las fases

IMPORTANTE: Si el contexto del usuario incluye un subtema especifico, un nivel actual o un horizonte temporal, cada fase debe mencionar esos datos explicitamente en su titulo o en su resumen. Ejemplos validos: "pizza", "principiante", "6 meses", "seis meses", "medio ano".

## TU TAREA

Paso 0 - GATE DE INVARIANTES: comprueba que sigues respondiendo a la misma meta exacta. Si para avanzar tendrias que cambiar metrica, horizonte, dominio o mecanismo, detente y senalalo.

Paso 1 - DESCOMPOSICION: Divide el objetivo en 3-6 fases distintas. Cada fase debe tener un enfoque claro, una salida observable y un criterio de salida medible.

Paso 2 - SECUENCIACION: Ordena las fases considerando dependencias y motivacion. Pon las fases de fundamentos reales primero. Coloca las fases mas dificiles despues de que el usuario haya ganado impulso.

Paso 3 - ASIGNACION DE TIEMPO: Para cada fase, estima las horas/semana necesarias. El total de fases superpuestas no debe exceder ${totalAvailableHours}h/semana. ${timeStepOverflow}

Paso 4 - HITOS: Cada fase recibe exactamente un hito. El hito debe ser observable, binario y coherente con la metrica o el progreso real del objetivo.

Paso 5 - REVISION DE RIESGOS: Para cada fase, identifica el modo de fallo mas probable y como mitigarlo.

Paso 6 - SELF-CHECK OBLIGATORIO: antes del JSON, muestra SOLO este preflight breve:
SELF_CHECK
- meta_exacta: ok|fail - cita la meta literal o explica el desvio
- metrica_exacta: ok|fail|n/a - cita la metrica literal
- horizonte_explicito: ok|fail|n/a - cita el horizonte literal
- dominio_valido: ok|fail - explica si todo sale del objetivo, del intake o de la card
- ejecutabilidad: ok|fail - confirma accion, salida observable y criterio de paso por fase
- datos_criticos: ok|missing - lista solo los faltantes que te obligarian a inventar metrica, horizonte, dominio o mecanismo

Reglas del self-check:
- Si cualquier check da fail o missing, declara "BLOQUEO CLARO:" antes del JSON.
- En ese caso, el JSON debe reflejar el bloqueo en "summary" y "conflicts". No inventes datos para completar el plan.
- Nunca cambies una cifra, una unidad, una moneda, un plazo o un mecanismo solo para que el plan parezca mejor.

Despues del self-check, produce el plan como JSON:
{
  "title": "titulo del plan en espanol, alineado con la meta real",
  "summary": "resumen de 2-3 oraciones en espanol. Debe preservar la meta literal y el horizonte literal si existe",
  "totalMonths": number,${horizonMonths ? ` // MAXIMO ${horizonMonths}` : ''}
  "estimatedWeeklyHours": number,
  "phases": [{
    "id": "phase-N",
    "title": "en espanol, especifico y no generico",
    "summary": "en espanol. Debe decir accion concreta + salida observable + ancla del objetivo",
    "goalIds": [],
    "startMonth": number,${horizonMonths ? ` // >= 1` : ''}
    "endMonth": number,${horizonMonths ? ` // <= ${horizonMonths} (OBLIGATORIO)` : ''}
    "hoursPerWeek": number,
    "milestone": "criterio medible y binario en espanol",
    "metrics": ["que rastrear sin perder la metrica original cuando exista"],
    "dependencies": ["phase-id"],
    "failureMode": "forma mas probable en que esta fase falla",
    "mitigation": "como prevenirlo"
  }],
  "milestones": [{ "id": "m-N", "label": "en espanol", "targetMonth": number,${horizonMonths ? ` // <= ${horizonMonths}` : ''} "phaseId": "phase-N" }],
  "conflicts": [{ "description": "en espanol", "resolution": "en espanol" }]
}

Responde SOLO con el SELF_CHECK breve, opcionalmente BLOQUEO CLARO, y luego el bloque JSON. No uses markdown para envolver el JSON.`;
}
