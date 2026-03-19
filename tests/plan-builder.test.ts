import { describe, it, expect } from 'vitest'
import { planBuilder } from '../src/skills/plan-builder'
import type { SkillContext } from '../src/runtime/types'

const ctx: SkillContext = {
  planDir: '',
  profileId: 'test-123',
  userLocale: 'es-AR',
  formalityLevel: 'informal',
  tokenMultiplier: 1.22
}

describe('planBuilder', () => {
  it('tiene name y tier correctos', () => {
    expect(planBuilder.name).toBe('plan-builder')
    expect(planBuilder.tier).toBe('alto')
  })

  describe('getSystemPrompt', () => {
    it('incluye instrucciones de formato JSON', () => {
      const prompt = planBuilder.getSystemPrompt(ctx)
      expect(prompt).toContain('JSON')
      expect(prompt).toContain('"semana"')
      expect(prompt).toContain('"dia"')
      expect(prompt).toContain('"hora"')
    })

    it('incluye reglas de planificación realista', () => {
      const prompt = planBuilder.getSystemPrompt(ctx)
      expect(prompt).toContain('sleep')
      expect(prompt).toContain('work')
      expect(prompt).toContain('Max 2-3')
    })

    it('usa voseo argentino para es-AR', () => {
      const prompt = planBuilder.getSystemPrompt(ctx)
      expect(prompt).toContain('Argentine Spanish')
      expect(prompt).toContain('voseo')
    })

    it('usa lenguaje simple para otros locales', () => {
      const prompt = planBuilder.getSystemPrompt({ ...ctx, userLocale: 'en-US' })
      expect(prompt).toContain('plain, simple language')
      expect(prompt).not.toContain('voseo')
    })

    it('prohíbe jargon técnico', () => {
      const prompt = planBuilder.getSystemPrompt(ctx)
      expect(prompt).toContain('Never use jargon')
      expect(prompt).toContain('Q1')
    })

    it('requiere categorías válidas', () => {
      const prompt = planBuilder.getSystemPrompt(ctx)
      expect(prompt).toContain('estudio')
      expect(prompt).toContain('ejercicio')
      expect(prompt).toContain('habito')
      expect(prompt).toContain('descanso')
    })
  })
})
