import { describe, it, expect } from 'vitest';
import { classifyGoal } from '@lib/pipeline/v5/classify';

describe('Goal Classifier (Regex-based)', () => {
  it('identifies a recurrent habit', () => {
    const result = classifyGoal('Meditar 10 minutos todos los días');
    expect(result.goalType).toBe('RECURRENT_HABIT');
    expect(result.extractedSignals.isRecurring).toBe(true);
  });

  it('identifies skill acquisition', () => {
    const result = classifyGoal('Aprender a tocar la guitarra');
    expect(result.goalType).toBe('SKILL_ACQUISITION');
    expect(result.extractedSignals.requiresSkillProgression).toBe(true);
  });

  it('identifies a finite project', () => {
    const result = classifyGoal('Armar el portfolio de diseño');
    expect(result.goalType).toBe('FINITE_PROJECT');
    expect(result.extractedSignals.hasDeliverable).toBe(true);
  });

  it('identifies a numeric target', () => {
    const result = classifyGoal('Ahorrar $5000 para viajar');
    expect(result.goalType).toBe('QUANT_TARGET_TRACKING');
    expect(result.extractedSignals.hasNumericTarget).toBe(true);
  });

  it('identifies identity exploration', () => {
    const result = classifyGoal('Explorar mi vocación profesional');
    expect(result.goalType).toBe('IDENTITY_EXPLORATION');
    expect(result.extractedSignals.isOpenEnded).toBe(true);
  });

  it('identifies relational goals', () => {
    const result = classifyGoal('Mejorar la relación con mi hijo');
    expect(result.goalType).toBe('RELATIONAL_EMOTIONAL');
    expect(result.extractedSignals.isRelational).toBe(true);
  });

  it('identifies high uncertainty transform', () => {
    const result = classifyGoal('Mudarme a España el año que viene');
    expect(result.goalType).toBe('HIGH_UNCERTAINTY_TRANSFORM');
  });

  it('detects health risk', () => {
    const result = classifyGoal('Recuperarme de la lesión de rodilla viendo al médico');
    expect(result.risk).toBe('HIGH_HEALTH');
  });

  it('detects finance risk', () => {
    const result = classifyGoal('Invertir mis ahorros en acciones');
    expect(result.risk).toBe('HIGH_FINANCE');
  });
});
