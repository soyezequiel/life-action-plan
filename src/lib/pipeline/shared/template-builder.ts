import { t } from '../../../i18n';
import { createStandaloneEquivalenceGroupId } from '../../domain/equivalence';
import type { GoalClassification } from '../../domain/goal-taxonomy';
import type { DomainKnowledgeCard } from '../../domain/domain-knowledge/bank';
import type { ActivityRequest } from '../../scheduler/types';
import type { TemplateInput, TemplateOutput, UserProfileV5 } from './phase-io';

function generateId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substring(2, 9)}`;
}

function shouldUseUncertaintyReductionTemplate(
  classification: GoalClassification,
  domainTasksAvailable: boolean,
): boolean {
  if (domainTasksAvailable) {
    return false;
  }

  return classification.goalType === 'HIGH_UNCERTAINTY_TRANSFORM'
    || classification.risk === 'HIGH_LEGAL';
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim() || '';
}

const ACTION_PREFIX_PATTERN = /^(practicar|estudiar|leer|cocinar|preparar|hacer|repasar|ajustar|ver|escuchar|escribir|caminar|correr|nadar|registrar|medir|revisar|entrenar|trabajar|aplicar|pulir|negociar|cerrar|servir|realizar)\b/i;
const LABEL_STOP_WORDS = new Set(['a', 'al', 'con', 'de', 'del', 'el', 'en', 'la', 'las', 'los', 'para', 'por', 'que', 'un', 'una', 'y', 'sin']);

function normalizeComparableText(value: string): string {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeComparableText(value: string): string[] {
  return normalizeComparableText(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !LABEL_STOP_WORDS.has(token));
}

function startsWithActionPrefix(label: string): boolean {
  return ACTION_PREFIX_PATTERN.test(normalizeText(label));
}

function lowerCaseLeadingChar(label: string): string {
  const trimmed = normalizeText(label);
  if (!trimmed) {
    return trimmed;
  }

  return `${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
}

function chooseConcreteActionVerb(label: string, tags: string[]): string {
  const normalizedLabel = normalizeComparableText(label);
  const normalizedTags = tags.map((tag) => normalizeComparableText(tag));

  if (
    normalizedTags.includes('reference')
    || normalizedTags.includes('planning')
    || normalizedLabel.includes('referencia')
    || normalizedLabel.includes('lectura')
    || normalizedLabel.includes('video')
  ) {
    return 'Estudiar';
  }

  if (
    normalizedTags.includes('review')
    || normalizedTags.includes('safety')
    || normalizedLabel.includes('chequeo')
    || normalizedLabel.includes('seguimiento')
    || normalizedLabel.includes('supervision')
  ) {
    return 'Realizar';
  }

  return 'Practicar';
}

function phaseContainsTaskLabel(taskLabel: string, phaseName: string): boolean {
  const normalizedTaskLabel = normalizeComparableText(taskLabel);
  const normalizedPhaseName = normalizeComparableText(phaseName);
  if (!normalizedTaskLabel || !normalizedPhaseName) {
    return false;
  }

  if (normalizedPhaseName.includes(normalizedTaskLabel)) {
    return true;
  }

  const taskTokens = tokenizeComparableText(taskLabel);
  if (taskTokens.length < 3) {
    return false;
  }

  const phaseTokens = new Set(tokenizeComparableText(phaseName));
  return taskTokens.every((token) => phaseTokens.has(token));
}

function rewriteDomainTaskLabelIfNeeded(
  task: { label: string; tags?: string[] },
  phases: TemplateInput['roadmap']['phases'],
): string {
  const label = normalizeText(task.label);
  if (!label || startsWithActionPrefix(label)) {
    return label;
  }

  const collidesWithPhase = phases.some((phase) => phaseContainsTaskLabel(label, phase.name));
  if (!collidesWithPhase) {
    return label;
  }

  const verb = chooseConcreteActionVerb(label, task.tags ?? []);
  return `${verb} ${lowerCaseLeadingChar(label)}`;
}

function stripGoalLead(text: string): string {
  return normalizeText(text)
    .replace(/^(quiero|quisiera|me gustaria|me gustaría|necesito|planeo|voy a|debo|tengo que)\s+/i, '')
    .replace(/\s+/g, ' ');
}

function clipLabel(value: string, maxLength = 52): string {
  const normalized = normalizeText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

function isHealthWeightGoal(goalText: string, classification: GoalClassification): boolean {
  const lowerGoal = goalText.toLowerCase();
  return classification.risk === 'HIGH_HEALTH'
    || /\b(bajar de peso|perder peso|adelgaz|peso|kg\b|kilos?|obesidad|sobrepeso|cintura|medidas|imc|bmi|fitness|condicion fisica|salud)\b/.test(lowerGoal);
}

function isCookingGoal(goalText: string): boolean {
  return /\b(cocina|cocinar|receta|recetas|plato|platos|gastronom|pasta|pastas|italian[oa]s?)\b/i.test(goalText);
}

function buildHealthActivityLabels(goalText: string, phases: string[]): string[] {
  const lowerGoal = goalText.toLowerCase();
  const lowerPhases = phases.join(' ').toLowerCase();
  const labels: string[] = [];

  if (/(cicl|bici|bike|cycling)/.test(lowerPhases) || /(cicl|bici|bike|cycling)/.test(lowerGoal)) {
    labels.push('Ciclismo suave o bici fija');
  }

  if (/(natac|natacion|swim|pileta|agua)/.test(lowerPhases) || /(natac|natacion|swim|pileta|agua)/.test(lowerGoal)) {
    labels.push('Natacion o aquagym');
  }

  if (/(camin|walk|pasos?)/.test(lowerPhases) || /(camin|walk|pasos?)/.test(lowerGoal)) {
    labels.push('Caminata constante');
  }

  if (/(fuerza|pesas|gym|muscul)/.test(lowerPhases) || /(fuerza|pesas|gym|muscul)/.test(lowerGoal)) {
    labels.push('Fuerza basica y movilidad');
  }

  if (/(peso|medidas|cintura|imc|bmi|altura|estatura)/.test(lowerPhases) || /(peso|medidas|cintura|imc|bmi|altura|estatura)/.test(lowerGoal)) {
    labels.push('Chequeo de peso y medidas');
  }

  if (/(medic|doctor|nutri|supervision|acompa[ñn]amiento|apoyo)/.test(lowerPhases) || /(medic|doctor|nutri|supervision|acompa[ñn]amiento|apoyo)/.test(lowerGoal)) {
    labels.push('Supervision profesional y chequeo de seguridad');
  }

  if (labels.length === 0) {
    labels.push(
      'Caminata constante',
      'Ciclismo suave o bici fija',
      'Natacion o aquagym',
      'Fuerza basica y movilidad',
    );
  }

  return Array.from(new Set(labels));
}

function buildCookingActivityLabels(goalText: string, phases: string[]): string[] {
  const lowerGoal = goalText.toLowerCase();
  const lowerPhases = phases.join(' ').toLowerCase();
  const labels: string[] = [];

  const subtopic = /(pastas?|pasta)/.test(lowerGoal) || /(pastas?|pasta)/.test(lowerPhases)
    ? 'pastas italianas'
    : /(salsas?|salsa)/.test(lowerGoal) || /(salsas?|salsa)/.test(lowerPhases)
      ? 'salsas italianas'
      : /(pizza)/.test(lowerGoal) || /(pizza)/.test(lowerPhases)
        ? 'pizza italiana'
        : 'cocina italiana';

  const methodUsesBooks = /(libros?|recetarios?|manuales?)/.test(lowerGoal) || /(libros?|recetarios?|manuales?)/.test(lowerPhases);

  labels.push(
    methodUsesBooks
      ? `Leer libros de cocina sobre ${subtopic}`
      : `Leer sobre ${subtopic}`,
    `Practicar ${subtopic}`,
    `Cocinar una receta completa de ${subtopic}`,
    `Cata y ajuste de ${subtopic}`,
  );

  if (/(principiante|basico|b[aá]sico)/.test(lowerGoal) || /(principiante|basico|b[aá]sico)/.test(lowerPhases)) {
    labels.unshift(`Fundamentos de ${subtopic}`);
  }

  return Array.from(new Set(labels));
}

function buildHealthTemplateActivities(
  input: TemplateInput,
  classification: GoalClassification,
  profile: UserProfileV5,
  goalId: string,
): ActivityRequest[] {
  const labels = buildHealthActivityLabels(
    input.goalText,
    input.roadmap.phases.map((phase) => `${phase.name} ${phase.focus_esAR}`),
  );
  let frequency = 2;
  if (classification.goalType === 'RECURRENT_HABIT') {
    frequency = 3;
  } else if (profile.freeHoursWeekday >= 10) {
    frequency = 4;
  } else if (profile.freeHoursWeekday >= 5) {
    frequency = 3;
  }

  return labels.map((label, index) => {
    const isCheckin = /peso y medidas/.test(label.toLowerCase());
    const isStrength = /fuerza/.test(label.toLowerCase());
    const isCycling = /ciclismo/.test(label.toLowerCase());
    const isSwimming = /natacion/.test(label.toLowerCase());
    const isSupervision = /supervision/.test(label.toLowerCase());

    return {
      id: generateId(`act-health-${index + 1}`),
      label,
      equivalenceGroupId: createStandaloneEquivalenceGroupId(label),
      durationMin: isCheckin ? 15 : isSupervision ? 20 : isStrength ? 30 : isSwimming ? 40 : isCycling ? 45 : 45,
      frequencyPerWeek: isCheckin || isSupervision ? 1 : isStrength ? Math.min(2, frequency) : frequency,
      goalId,
      constraintTier: isCheckin || isSupervision ? 'soft_weak' : 'soft_strong',
      minRestDaysBetween: 1,
    };
  });
}

function buildCookingTemplateActivities(
  input: TemplateInput,
  classification: GoalClassification,
  profile: UserProfileV5,
  goalId: string,
): ActivityRequest[] {
  const labels = buildCookingActivityLabels(
    input.goalText,
    input.roadmap.phases.map((phase) => `${phase.name} ${phase.focus_esAR}`),
  );
  const baseFrequency = classification.goalType === 'RECURRENT_HABIT'
    ? 3
    : profile.freeHoursWeekday >= 5
      ? 3
      : 2;

  return labels.map((label, index) => {
    const normalized = label.toLowerCase();
    const isReading = /leer libros/.test(normalized) || /leer sobre/.test(normalized);
    const isPractice = /practicar/.test(normalized);
    const isCompleteRecipe = /cocinar una receta completa/.test(normalized);
    const isFeedback = /cata y ajuste/.test(normalized);

    return {
      id: generateId(`act-cooking-${index + 1}`),
      label,
      equivalenceGroupId: createStandaloneEquivalenceGroupId(label),
      durationMin: isReading ? 25 : isCompleteRecipe ? 45 : isPractice ? 35 : isFeedback ? 20 : 30,
      frequencyPerWeek: isFeedback ? 1 : isReading ? 2 : baseFrequency,
      goalId,
      constraintTier: isReading || isFeedback ? 'soft_weak' : 'soft_strong',
      minRestDaysBetween: isCompleteRecipe ? 1 : undefined,
    };
  });
}

function buildUncertaintyReductionActivities(
  input: TemplateInput,
  classification: GoalClassification,
  goalId: string,
): ActivityRequest[] {
  const shortGoal = clipLabel(stripGoalLead(input.goalText), 31);
  const milestone = clipLabel(input.roadmap.milestones[0] ?? '', 33);
  const validationLabel = classification.extractedSignals.dependsOnThirdParties || classification.risk !== 'LOW'
    ? 'Validar supuestos con terceros'
    : 'Probar siguiente paso verificable';
  const labels = [
    shortGoal ? `Definir avance verificable para ${shortGoal}` : 'Definir avance verificable',
    'Mapear requisitos y restricciones',
    validationLabel,
    milestone ? `Preparar hito: ${milestone}` : 'Preparar siguiente hito',
  ];

  return Array.from(new Set(labels)).map((label, index) => ({
    id: generateId(`act-uncertainty-${index + 1}`),
    label,
    equivalenceGroupId: createStandaloneEquivalenceGroupId(label),
    durationMin: index === 1 ? 60 : 45,
    frequencyPerWeek: 1,
    goalId,
    constraintTier: index === 0 ? 'soft_strong' : 'soft_weak',
  }));
}

function calculateWeeklyBudget(profile: UserProfileV5): number {
  return (profile.freeHoursWeekday * 5) + (profile.freeHoursWeekend * 2);
}

function adjustActivitiesToBudget(activities: ActivityRequest[], budgetHours: number): ActivityRequest[] {
  const totalRequestedHours = activities.reduce((acc, a) => acc + (a.durationMin * a.frequencyPerWeek) / 60, 0);

  if (totalRequestedHours <= budgetHours * 0.9 || budgetHours <= 0) {
    return activities;
  }

  // Ordenar por debilidad de restricción para podar primero lo menos importante
  const sorted = [...activities].sort((a, b) => {
    const tierA = a.constraintTier || 'soft_weak';
    const tierB = b.constraintTier || 'soft_weak';
    if (tierA.includes('weak') && !tierB.includes('weak')) return -1;
    if (!tierA.includes('weak') && tierB.includes('weak')) return 1;
    return 0;
  });

  const adjusted = JSON.parse(JSON.stringify(activities)) as ActivityRequest[];
  let currentHours = totalRequestedHours;
  const targetHours = budgetHours * 0.85;

  // Límite de seguridad para evitar loops infinitos
  let iterations = 0;
  while (currentHours > targetHours && iterations < 20) {
    iterations++;
    let changed = false;

    for (const activityRef of sorted) {
      if (currentHours <= targetHours) break;

      const idx = adjusted.findIndex((a) => a.id === activityRef.id);
      if (idx === -1) continue;

      const act = adjusted[idx];
      // Intentar reducir frecuencia primero si es > 1
      if (act.frequencyPerWeek > 1) {
        act.frequencyPerWeek -= 1;
        currentHours -= act.durationMin / 60;
        changed = true;
      } else if (act.durationMin > 20) {
        // Si no se puede reducir frecuencia, reducimos duración (mínimo 20 min)
        const reduction = Math.min(15, act.durationMin - 20);
        if (reduction > 0) {
          act.durationMin -= reduction;
          currentHours -= reduction / 60;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  return adjusted;
}

export function buildTemplate(
  input: TemplateInput,
  classification: GoalClassification,
  profile: UserProfileV5,
  domainCard?: DomainKnowledgeCard,
): TemplateOutput {
  const activities: ActivityRequest[] = [];
  const { phases } = input.roadmap;

  let minRestDaysBetween: number | undefined;
  if (domainCard) {
    if (domainCard.domainLabel.toLowerCase() === 'running') {
      minRestDaysBetween = 1;
    } else {
      const needsRest = domainCard.constraints.some((constraint) =>
        constraint.description.toLowerCase().includes('descanso')
        || constraint.description.toLowerCase().includes('rest')
        || constraint.description.toLowerCase().includes('recuperaci'),
      );
      if (needsRest) {
        minRestDaysBetween = 1;
      }
    }
  }

  let baseFreq = 2;
  if (classification.goalType === 'RECURRENT_HABIT') {
    baseFreq = 3;
  } else if (profile.freeHoursWeekday >= 10) {
    baseFreq = 4;
  } else if (profile.freeHoursWeekday >= 5) {
    baseFreq = 3;
  }

  const domainTasks = domainCard && domainCard.tasks.length > 0
    ? classification.goalType === 'RECURRENT_HABIT'
      ? domainCard.tasks.slice(0, 1)
      : domainCard.tasks
    : [];
  const augmentedDomainTasks = [...domainTasks];
  if (isHealthWeightGoal(input.goalText, classification)) {
    const hasSafetyTask = augmentedDomainTasks.some((task) =>
      /supervision|seguridad|seguimiento profesional|medico|nutri|acompanamiento|apoyo/i.test(task.label),
    );
    if (!hasSafetyTask) {
      augmentedDomainTasks.unshift({
        id: 'health_supervision',
        label: 'Supervision profesional y chequeo de seguridad',
        typicalDurationMin: 20,
        tags: ['safety', 'health', 'review'],
        equivalenceGroupId: 'health-safety-review',
      });
    }
  }
  const useCookingTemplate = domainTasks.length === 0 && isCookingGoal(input.goalText);
  const useHealthTemplate = domainTasks.length === 0 && isHealthWeightGoal(input.goalText, classification);
  const useUncertaintyReductionTemplate = shouldUseUncertaintyReductionTemplate(classification, domainTasks.length > 0);
  const goalId = 'generated-goal';

  if (augmentedDomainTasks.length > 0) {
    for (const task of augmentedDomainTasks) {
      activities.push({
        id: generateId(`act-${task.id}`),
        label: rewriteDomainTaskLabelIfNeeded(task, phases),
        equivalenceGroupId: task.equivalenceGroupId,
        durationMin: task.typicalDurationMin,
        frequencyPerWeek: baseFreq,
        goalId,
        constraintTier: 'soft_strong',
        minRestDaysBetween,
      });
    }
  } else if (useCookingTemplate) {
    activities.push(...buildCookingTemplateActivities(input, classification, profile, goalId));
  } else if (useHealthTemplate) {
    activities.push(...buildHealthTemplateActivities(input, classification, profile, goalId));
  } else if (useUncertaintyReductionTemplate) {
    activities.push(...buildUncertaintyReductionActivities(input, classification, goalId));
  } else {
    for (const phase of phases) {
      activities.push({
        id: generateId('act-phase'),
        label: phase.focus_esAR || phase.name,
        equivalenceGroupId: createStandaloneEquivalenceGroupId(phase.focus_esAR || phase.name),
        durationMin: 60,
        frequencyPerWeek: baseFreq,
        goalId,
        constraintTier: 'soft_weak',
        minRestDaysBetween,
      });
    }
  }

  if (activities.length === 0) {
    activities.push({
      id: generateId('act-general'),
      label: t('pipeline.v5.template.default_activity'),
      equivalenceGroupId: createStandaloneEquivalenceGroupId('actividad-principal'),
      durationMin: 45,
      frequencyPerWeek: baseFreq,
      goalId,
      constraintTier: 'soft_weak',
      minRestDaysBetween,
    });
  }

  const budget = calculateWeeklyBudget(profile);
  const adjustedActivities = adjustActivitiesToBudget(activities, budget);

  return { activities: adjustedActivities };
}

