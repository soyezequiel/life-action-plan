import type { TemplateInput, TemplateOutput } from './phase-io-v5';
import type { DomainKnowledgeCard } from '../../domain/domain-knowledge/bank';
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

  // Calculamos constraints de descanso según dominio
  let minRestDaysBetween: number | undefined = undefined;
  if (domainCard) {
    if (domainCard.domainLabel.toLowerCase() === 'running') {
      minRestDaysBetween = 1;
    } else {
      const needsRest = domainCard.constraints.some(c => 
        c.description.toLowerCase().includes('descanso') || 
        c.description.toLowerCase().includes('rest') ||
        c.description.toLowerCase().includes('recuperaci')
      );
      if (needsRest) minRestDaysBetween = 1;
    }
  }

  // Frecuencia dinámica basada en horas libres y tipo de objetivo
  let baseFreq = 2; // por defecto 2 a la semana
  if (classification.goalType === 'RECURRENT_HABIT') {
    baseFreq = 5;
  } else if (profile.freeHoursWeekday >= 10) {
    baseFreq = 4;
  } else if (profile.freeHoursWeekday >= 5) {
    baseFreq = 3;
  }

  // Si tenemos domain card, aprovechamos las tareas para generar diferentes actividades
  if (domainCard && domainCard.tasks.length > 0) {
    domainCard.tasks.forEach(task => {
      activities.push({
        id: generateId(`act-${task.id}`),
        label: task.label,
        durationMin: task.typicalDurationMin,
        frequencyPerWeek: baseFreq,
        goalId: 'generated-goal', // Determinado por el contexto en el runner final
        constraintTier: 'soft_strong',
        minRestDaysBetween,
      });
    });
  } else {
    // Generamos al menos una actividad utilizando la info de la fase
    phases.forEach(phase => {
      activities.push({
        id: generateId('act-phase'),
        label: phase.name,
        durationMin: 60,
        frequencyPerWeek: baseFreq,
        goalId: 'generated-goal',
        constraintTier: 'soft_weak',
        minRestDaysBetween,
      });
    });
  }

  // Fallback si no había phases ni domainCard
  if (activities.length === 0) {
    activities.push({
      id: generateId('act-general'),
      label: 'Actividad Principal',
      durationMin: 45,
      frequencyPerWeek: baseFreq,
      goalId: 'generated-goal',
      constraintTier: 'soft_weak',
      minRestDaysBetween,
    });
  }

  return { activities };
}
