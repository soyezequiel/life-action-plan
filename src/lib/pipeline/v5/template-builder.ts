import { t } from '../../../i18n';
import { createStandaloneEquivalenceGroupId } from '../../domain/equivalence';
import type { GoalClassification } from '../../domain/goal-taxonomy';
import type { DomainKnowledgeCard } from '../../domain/domain-knowledge/bank';
import type { ActivityRequest } from '../../scheduler/types';
import type { TemplateInput, TemplateOutput, UserProfileV5 } from './phase-io-v5';

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
  const useUncertaintyReductionTemplate = shouldUseUncertaintyReductionTemplate(classification, domainTasks.length > 0);
  const goalId = 'generated-goal';

  if (domainTasks.length > 0) {
    for (const task of domainTasks) {
      activities.push({
        id: generateId(`act-${task.id}`),
        label: task.label,
        equivalenceGroupId: task.equivalenceGroupId,
        durationMin: task.typicalDurationMin,
        frequencyPerWeek: baseFreq,
        goalId,
        constraintTier: 'soft_strong',
        minRestDaysBetween,
      });
    }
  } else if (useUncertaintyReductionTemplate) {
    activities.push(...buildUncertaintyReductionActivities(input, classification, goalId));
  } else {
    for (const phase of phases) {
      activities.push({
        id: generateId('act-phase'),
        label: phase.name,
        equivalenceGroupId: createStandaloneEquivalenceGroupId(phase.name),
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

  return { activities };
}
