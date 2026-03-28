import { describe, expect, it } from 'vitest';

import { Scratchpad } from '../../src/lib/pipeline/v6/scratchpad';

describe('Scratchpad', () => {
  it('adds entries and retrieves them in order', () => {
    const scratchpad = new Scratchpad();

    scratchpad.add({
      phase: 'interpret',
      agent: 'goal-interpreter',
      iteration: 1,
      action: 'Analizo el objetivo',
      reasoning: 'Hace falta clasificar el objetivo.',
      result: 'Clasificacion inicial lista',
      tokensUsed: 10,
    });
    scratchpad.add({
      phase: 'clarify',
      agent: 'clarifier',
      iteration: 2,
      action: 'Pido contexto adicional',
      reasoning: 'Faltan datos de disponibilidad.',
      result: 'Preguntas preparadas',
      tokensUsed: 15,
    });

    const entries = scratchpad.getAll();

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      phase: 'interpret',
      agent: 'goal-interpreter',
      iteration: 1,
    });
    expect(entries[1]).toMatchObject({
      phase: 'clarify',
      agent: 'clarifier',
      iteration: 2,
    });
    expect(entries[0]?.timestamp).toEqual(expect.any(String));
    expect(entries[1]?.timestamp).toEqual(expect.any(String));
  });

  it('filters by phase', () => {
    const scratchpad = new Scratchpad();

    scratchpad.add({
      phase: 'interpret',
      agent: 'goal-interpreter',
      iteration: 1,
      action: 'Interpreto',
      reasoning: 'Contexto inicial.',
      result: 'Interpretacion lista',
      tokensUsed: 8,
    });
    scratchpad.add({
      phase: 'plan',
      agent: 'planner',
      iteration: 2,
      action: 'Planeo',
      reasoning: 'Hay suficiente contexto.',
      result: 'Roadmap listo',
      tokensUsed: 12,
    });

    expect(scratchpad.getByPhase('interpret')).toHaveLength(1);
    expect(scratchpad.getByPhase('interpret')[0]?.agent).toBe('goal-interpreter');
  });

  it('filters by agent', () => {
    const scratchpad = new Scratchpad();

    scratchpad.add({
      phase: 'clarify',
      agent: 'clarifier',
      iteration: 1,
      action: 'Pregunto',
      reasoning: 'Faltan restricciones.',
      result: 'Una pregunta',
      tokensUsed: 4,
    });
    scratchpad.add({
      phase: 'critique',
      agent: 'critic',
      iteration: 2,
      action: 'Evaluo',
      reasoning: 'Reviso consistencia.',
      result: 'Plan aprobado',
      tokensUsed: 6,
    });

    expect(scratchpad.getByAgent('clarifier')).toHaveLength(1);
    expect(scratchpad.getByAgent('clarifier')[0]?.phase).toBe('clarify');
  });

  it('totalTokens sums all entries', () => {
    const scratchpad = new Scratchpad();

    scratchpad.add({
      phase: 'interpret',
      agent: 'goal-interpreter',
      iteration: 1,
      action: 'Analizo',
      reasoning: 'Inicio',
      result: 'Salida 1',
      tokensUsed: 11,
    });
    scratchpad.add({
      phase: 'plan',
      agent: 'planner',
      iteration: 2,
      action: 'Diseno',
      reasoning: 'Paso siguiente',
      result: 'Salida 2',
      tokensUsed: 9,
    });

    expect(scratchpad.totalTokens()).toBe(20);
  });

  it('summarize produces Spanish narrative', () => {
    const scratchpad = new Scratchpad();

    scratchpad.add({
      phase: 'interpret',
      agent: 'goal-interpreter',
      iteration: 1,
      action: 'Analizo el objetivo.',
      reasoning: 'Hay que entender la meta.',
      result: 'Clasificacion inicial lista.',
      tokensUsed: 10,
    });
    scratchpad.add({
      phase: 'clarify',
      agent: 'clarifier',
      iteration: 1,
      action: 'Pido mas contexto.',
      reasoning: 'Faltan horarios.',
      result: 'Dos preguntas listas.',
      tokensUsed: 12,
    });

    const summary = scratchpad.summarize();

    expect(summary).toContain('Iteracion 1:');
    expect(summary).toContain('El interprete de objetivos');
    expect(summary).toContain('el clarificador');
    expect(summary).toContain('resultado:');
  });

  it('toJSON returns serializable object', () => {
    const scratchpad = new Scratchpad();

    scratchpad.add({
      phase: 'schedule',
      agent: 'scheduler',
      iteration: 3,
      action: 'Calendarizo',
      reasoning: 'Ubico bloques disponibles.',
      result: 'Agenda propuesta',
      tokensUsed: 14,
    });

    const json = scratchpad.toJSON();

    expect(json).toEqual({
      entries: expect.arrayContaining([
        expect.objectContaining({
          phase: 'schedule',
          agent: 'scheduler',
          iteration: 3,
        }),
      ]),
    });
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
  });

  it('handles empty scratchpad gracefully', () => {
    const scratchpad = new Scratchpad();

    expect(scratchpad.getAll()).toEqual([]);
    expect(scratchpad.getByPhase('interpret')).toEqual([]);
    expect(scratchpad.getByAgent('critic')).toEqual([]);
    expect(scratchpad.totalTokens()).toBe(0);
    expect(scratchpad.summarize()).toBe('No hay razonamiento registrado.');
    expect(scratchpad.toJSON()).toEqual({ entries: [] });
  });
});
