import type { TemplateInput, TemplateOutput } from './phase-io-v5';
import type { DomainKnowledgeCard } from '../../domain/domain-knowledge/bank';
import { createStandaloneEquivalenceGroupId } from '../../domain/equivalence';
import type { ActivityRequest } from '../../scheduler/types';
import type { UserProfileV5 } from './phase-io-v5';
import type { GoalClassification } from '../../domain/goal-taxonomy';

// Utility para generar IDs
function generateId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substring(2, 9)}`;
}

export function buildTemplate(
  input: TemplateInput,
  classification: GoalClassification,
  profile: UserProfileV5,
  domainCard?: DomainKnowledgeCard
): TemplateOutput {
  const activities: ActivityRequest[] = [];
  const { phases } = input.roadmap;

  // Calculamos constraints de descanso segun dominio
  let minRestDaysBetween: number | undefined = undefined;
  if (domainCard) {
    if (domainCard.domainLabel.toLowerCase() === 'running') {
      minRestDaysBetween = 1;
    } else {
      const needsRest = domainCard.constraints.some((constraint) =>
        constraint.description.toLowerCase().includes('descanso') ||
        constraint.description.toLowerCase().includes('rest') ||
        constraint.description.toLowerCase().includes('recuperaci')
      );
      if (needsRest) minRestDaysBetween = 1;
    }
  }

  // Los habitos recurrentes simples arrancan con una cadencia moderada.
  let baseFreq = 2;
  if (classification.goalType === 'RECURRENT_HABIT') {
    baseFreq = 3;
  } else if (profile.freeHoursWeekday >= 10) {
    baseFreq = 4;
  } else if (profile.freeHoursWeekday >= 5) {
    baseFreq = 3;
  }

  const domainTasks =
    domainCard && domainCard.tasks.length > 0
      ? classification.goalType === 'RECURRENT_HABIT'
        ? domainCard.tasks.slice(0, 1)
        : domainCard.tasks
      : [];

  if (domainTasks.length > 0) {
    domainTasks.forEach((task) => {
      activities.push({
        id: generateId(`act-${task.id}`),
        label: task.label,
        equivalenceGroupId: task.equivalenceGroupId,
        durationMin: task.typicalDurationMin,
        frequencyPerWeek: baseFreq,
        goalId: 'generated-goal',
        constraintTier: 'soft_strong',
        minRestDaysBetween,
      });
    });
  } else {
    phases.forEach((phase) => {
      activities.push({
        id: generateId('act-phase'),
        label: phase.name,
        equivalenceGroupId: createStandaloneEquivalenceGroupId(phase.name),
        durationMin: 60,
        frequencyPerWeek: baseFreq,
        goalId: 'generated-goal',
        constraintTier: 'soft_weak',
        minRestDaysBetween,
      });
    });
  }

  if (activities.length === 0) {
    activities.push({
      id: generateId('act-general'),
      label: 'Actividad Principal',
      equivalenceGroupId: createStandaloneEquivalenceGroupId('actividad-principal'),
      durationMin: 45,
      frequencyPerWeek: baseFreq,
      goalId: 'generated-goal',
      constraintTier: 'soft_weak',
      minRestDaysBetween,
    });
  }

  return { activities };
}
