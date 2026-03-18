import type { AgentRuntime, SkillContext, SkillResult } from '../runtime/types'

export interface Skill {
  name: string
  tier: 'alto' | 'medio' | 'bajo'
  getSystemPrompt(ctx: SkillContext): string
  run(runtime: AgentRuntime, ctx: SkillContext): Promise<SkillResult>
}

export type { AgentRuntime, SkillContext, SkillResult }
