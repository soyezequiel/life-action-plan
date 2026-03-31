import { createRequire } from 'node:module';

import type { AgentRuntime } from '../../runtime/types';
import { clarifierAgent } from './agents/clarifier-agent';
import { domainExpertAgent } from './agents/domain-expert';
import { goalInterpreterAgent } from './agents/goal-interpreter';
import { packagerAgent } from './agents/packager-agent';
import { schedulerAgent } from './agents/scheduler-agent';
import type { V6Agent, V6AgentName } from './types';

import { criticAgent } from './agents/critic-agent';
import { feasibilityCheckerAgent } from './agents/feasibility-checker';

type RegisteredAgent = V6Agent<unknown, unknown> & {
  execute(input: unknown, runtime: AgentRuntime): Promise<unknown>
  fallback(input: unknown): unknown
};


export class AgentRegistry {
  private agents: Map<V6AgentName, RegisteredAgent> = new Map()

  register<TInput, TOutput>(agent: V6Agent<TInput, TOutput>): void {
    this.agents.set(agent.name, agent as RegisteredAgent)
  }

  get<TInput, TOutput>(name: V6AgentName): V6Agent<TInput, TOutput> {
    const agent = this.agents.get(name)

    if (!agent) {
      throw new Error(`Agent "${name}" not registered`)
    }

    return agent as V6Agent<TInput, TOutput>
  }

  has(name: V6AgentName): boolean {
    return this.agents.has(name)
  }

  listRegistered(): V6AgentName[] {
    return Array.from(this.agents.keys())
  }
}

export function createDefaultRegistry(): AgentRegistry {
  const registry = new AgentRegistry()

  registry.register(goalInterpreterAgent)
  registry.register(clarifierAgent)
  registry.register(schedulerAgent)
  registry.register(packagerAgent)
  registry.register(domainExpertAgent)

  registry.register(criticAgent as RegisteredAgent)
  registry.register(feasibilityCheckerAgent as RegisteredAgent)

  return registry
}
