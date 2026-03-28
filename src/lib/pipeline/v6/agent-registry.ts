import { createRequire } from 'node:module';

import type { AgentRuntime } from '../../runtime/types';
import { clarifierAgent } from './agents/clarifier-agent';
import { domainExpertAgent } from './agents/domain-expert';
import { goalInterpreterAgent } from './agents/goal-interpreter';
import { packagerAgent } from './agents/packager-agent';
import { schedulerAgent } from './agents/scheduler-agent';
import type { V6Agent, V6AgentName } from './types';

type RegisteredAgent = V6Agent<unknown, unknown> & {
  execute(input: unknown, runtime: AgentRuntime): Promise<unknown>
  fallback(input: unknown): unknown
};

const requireModule = createRequire(import.meta.url);

function isRegisteredAgent(value: unknown): value is RegisteredAgent {
  return typeof value === 'object'
    && value !== null
    && typeof (value as RegisteredAgent).name === 'string'
    && typeof (value as RegisteredAgent).execute === 'function'
    && typeof (value as RegisteredAgent).fallback === 'function';
}

function loadOptionalAgent(
  modulePath: string,
  exportName: 'criticAgent' | 'feasibilityCheckerAgent',
): RegisteredAgent | null {
  try {
    const loadedModule = requireModule(modulePath) as Record<string, unknown>;
    const candidate = loadedModule[exportName];
    return isRegisteredAgent(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

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

  const optionalAgents = [
    loadOptionalAgent('./agents/critic-agent', 'criticAgent'),
    loadOptionalAgent('./agents/feasibility-checker', 'feasibilityCheckerAgent'),
  ]

  for (const agent of optionalAgents) {
    if (agent) {
      registry.register(agent)
    }
  }

  return registry
}
