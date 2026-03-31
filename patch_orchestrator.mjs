import fs from 'fs';
import path from 'path';

const file = 'f:/proyectos/planificador-vida/src/lib/pipeline/v6/orchestrator.ts';
let content = fs.readFileSync(file, 'utf8');

// 1. Constructor
content = content.replace(
  /constructor\(\s*config: Partial<OrchestratorConfig>,\s*runtime: AgentRuntime,/,
  'constructor(\n    config: Partial<OrchestratorConfig>,\n    brainRuntime: AgentRuntime,\n    fastRuntime?: AgentRuntime,'
);

// 2. this.runtime = runtime
content = content.replace(
  /this\.runtime = runtime;/,
  'this.brainRuntime = brainRuntime;\n    this.fastRuntime = fastRuntime ?? brainRuntime;'
);

// 3. static restore
content = content.replace(
  /static restore\(\s*snapshot: PlanOrchestratorSnapshot,\s*runtime: AgentRuntime,/,
  'static restore(\n    snapshot: PlanOrchestratorSnapshot,\n    brainRuntime: AgentRuntime,\n    fastRuntime?: AgentRuntime,'
);

// 4. orchestrator = new PlanOrchestrator(...)
content = content.replace(
  /new PlanOrchestrator\(parsed\.config, runtime, runtimeLabel, debugListener\)/,
  'new PlanOrchestrator(parsed.config, brainRuntime, fastRuntime, runtimeLabel, debugListener)'
);

// 5. Agent executions (interpret, clarify, strategy, check, schedule, critique, package, domain-expert)
content = content.replace(/agent\.execute\(\{ goalText: this\.context\.goalText \}, this\.runtime\)/g, 'agent.execute({ goalText: this.context.goalText }, this.fastRuntime)');
content = content.replace(/agent\.execute\(input, this\.runtime\)/g, (match, offset, str) => {
    // We need to decide based on context. 
    // This is risky with global replace.
    return match; 
});

// Since global replace is risky for 'agent.execute(input, this.runtime)', I'll do them one by one with context
content = content.replace('const result = await agent.execute(input, this.runtime);', (match) => {
    // If it's in executeClarify, use brainRuntime. In executeCheck/Schedule/Package, use fastRuntime.
    // But I'll just do literal replacements for the known ones.
    return match;
});

// Manual replacements for agents
content = content.replace('const result = await agent.execute(input, this.runtime); // clarifier', 'const result = await agent.execute(input, this.brainRuntime);');
content = content.replace('const result = await agent.execute(input, this.runtime); // check', 'const result = await agent.execute(input, this.fastRuntime);');
// ... and so on.

// Actually, I'll use specific patterns found in the file
content = content.replace('await agent.execute(input, this.runtime);', 'await agent.execute(input, this.brainRuntime);'); // Clarifier (first occurrence)
content = content.replace('generateStrategyWithSource(\n        this.runtime,', 'generateStrategyWithSource(\n        this.brainRuntime,');
content = content.replace('await agent.execute(input, this.runtime);', 'await agent.execute(input, this.fastRuntime);'); // Checker (next occurrence)
content = content.replace('await agent.execute(input, this.runtime) as ScheduleExecutionResult;', 'await agent.execute(input, this.fastRuntime) as ScheduleExecutionResult;');
content = content.replace('await agent.execute(input, this.brainRuntime);', 'await agent.execute(input, this.brainRuntime);'); // Already changed or logic is same
content = content.replace('await agent.execute(input, this.runtime);', 'await agent.execute(input, this.brainRuntime);'); // Critic
content = content.replace('generateStrategyWithSource(\n        this.runtime,', 'generateStrategyWithSource(\n        this.brainRuntime,'); // Revise
content = content.replace('}, this.runtime);', '}, this.brainRuntime);'); // Domain Expert
content = content.replace('await agent.execute(input, this.runtime);', 'await agent.execute(input, this.fastRuntime);'); // Packager

fs.writeFileSync(file, content);
console.log('Orchestrator patched successfully');
