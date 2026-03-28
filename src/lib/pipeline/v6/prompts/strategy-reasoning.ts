import type { CriticFinding, GoalInterpretation } from '../types';
import type { DomainKnowledgeCard } from '../../../domain/domain-knowledge/bank';

export interface StrategyPromptInput {
  goalText: string;
  goalType: string;
  interpretation: GoalInterpretation;
  userProfile: {
    freeHoursWeekday: number;
    freeHoursWeekend: number;
    energyLevel: string;
    fixedCommitments: string[];
  };
  domainCard: DomainKnowledgeCard | null;
  clarificationAnswers: Record<string, string>;
  previousCriticFindings?: CriticFinding[];
}

function formatAnswers(answers: Record<string, string>): string {
  const entries = Object.entries(answers);
  if (entries.length === 0) return 'Ninguna respuesta adicional.';
  return entries.map(([key, value]) => `- ${key}: ${value}`).join('\n');
}

function formatDomainCard(card: DomainKnowledgeCard | null): string {
  if (!card) return '';

  const parts: string[] = [`Dominio: ${card.domainLabel}`];

  if (card.tasks.length > 0) {
    parts.push(`Tareas tipicas: ${card.tasks.map((t) => t.label).join(', ')}`);
  }

  if (card.progression?.levels && card.progression.levels.length > 0) {
    parts.push(`Progresion: ${card.progression.levels.map((l) => l.description).join(' -> ')}`);
  }

  if (card.tasks.length > 0) {
    const durations = card.tasks.map((t) => t.typicalDurationMin);
    const minDur = Math.min(...durations);
    const maxDur = Math.max(...durations);
    parts.push(`Duracion tipica de sesion: ${minDur}-${maxDur} minutos`);
  }

  return parts.join('\n');
}

function formatCriticFindings(findings: CriticFinding[]): string {
  return findings
    .map((f, i) => {
      const parts = [`${i + 1}. [${f.severity}/${f.category}] ${f.message}`];
      if (f.suggestion) {
        parts.push(`   Sugerencia: ${f.suggestion}`);
      }
      if (f.affectedPhaseIds.length > 0) {
        parts.push(`   Fases afectadas: ${f.affectedPhaseIds.join(', ')}`);
      }
      return parts.join('\n');
    })
    .join('\n');
}

export function buildStrategyPrompt(input: StrategyPromptInput): string {
  const {
    goalText,
    goalType,
    interpretation,
    userProfile,
    domainCard,
    clarificationAnswers,
    previousCriticFindings,
  } = input;

  const totalAvailableHours =
    userProfile.freeHoursWeekday * 5 + userProfile.freeHoursWeekend * 2;

  const answersFormatted = formatAnswers(clarificationAnswers);
  const domainCardFormatted = formatDomainCard(domainCard);

  const revisionBlock = previousCriticFindings && previousCriticFindings.length > 0
    ? `
## REVISION OBLIGATORIA — La revision anterior encontro estos problemas:
${formatCriticFindings(previousCriticFindings)}
DEBES abordar cada problema. Para cada hallazgo, explica que cambiaste y por que.
`
    : '';

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
- Contexto adicional del usuario: ${answersFormatted}

## Conocimiento de dominio
${domainCardFormatted || 'No hay conocimiento de dominio especializado disponible. Usa mejores practicas generales.'}
${revisionBlock}
## Tu tarea

Piensa en esto sistematicamente:

Paso 1 — DESCOMPOSICION: Divide el objetivo en 3-6 fases distintas. Cada fase debe tener un enfoque claro y un criterio de salida medible.

Paso 2 — SECUENCIACION: Ordena las fases considerando dependencias y motivacion. Pon las fases de fundamentos primero. Coloca las fases mas dificiles DESPUES de que el usuario haya ganado impulso (no al inicio).

Paso 3 — ASIGNACION DE TIEMPO: Para cada fase, estima las horas/semana necesarias. El total de fases superpuestas NO DEBE exceder ${totalAvailableHours}h/semana. Si lo excede, extiende el cronograma o reduce el alcance — no ignores la restriccion.

Paso 4 — HITOS: Cada fase recibe exactamente un hito. El hito debe ser observable y binario (lo lograste o no). NO "mejorar en X" sino "completar Y" o "alcanzar la metrica Z".

Paso 5 — REVISION DE RIESGOS: Para cada fase, identifica el modo de fallo mas probable y como mitigarlo.

Despues de razonar los 5 pasos, produce el plan como JSON:
{
  "title": "titulo del plan en espanol",
  "summary": "resumen de 2-3 oraciones en espanol",
  "totalMonths": number,
  "estimatedWeeklyHours": number,
  "phases": [{
    "id": "phase-N",
    "title": "en espanol",
    "summary": "en espanol",
    "goalIds": [],
    "startMonth": number,
    "endMonth": number,
    "hoursPerWeek": number,
    "milestone": "criterio medible en espanol",
    "metrics": ["que rastrear"],
    "dependencies": ["phase-id"],
    "failureMode": "forma mas probable en que esta fase falla",
    "mitigation": "como prevenirlo"
  }],
  "milestones": [{ "id": "m-N", "label": "en espanol", "targetMonth": number, "phaseId": "phase-N" }],
  "conflicts": [{ "description": "en espanol", "resolution": "en espanol" }]
}

Responde SOLO con el razonamiento paso a paso seguido del bloque JSON. No uses markdown para envolver el JSON.`;
}
