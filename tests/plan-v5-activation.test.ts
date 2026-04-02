import { describe, expect, it } from 'vitest'

import { convertV5PackageToPlanEvents } from '../src/lib/domain/plan-v5-activation'

describe('plan v5 activation', () => {
  it('preserves the scheduled local date when converting calendar events to progress seeds', () => {
    const events = convertV5PackageToPlanEvents({
      package: {
        plan: {
          detail: {
            weeks: [
              {
                weekIndex: 1,
                scheduledEvents: [
                  {
                    startAt: '2026-04-08T18:00:00.000Z',
                    durationMin: 45,
                    title: 'Caminata constante',
                    goalIds: ['goal-1']
                  }
                ]
              }
            ]
          }
        }
      } as any,
      goalId: 'goal-1',
      goalText: 'Bajar de peso',
      timezone: 'UTC'
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      semana: 1,
      dia: 'miercoles',
      fecha: '2026-04-08',
      hora: '18:00',
      actividad: 'Caminata constante'
    })
  })
})
