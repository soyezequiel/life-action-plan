import fs from 'fs';

const file = 'f:/proyectos/planificador-vida/src/lib/pipeline/v6/orchestrator.ts';
let content = fs.readFileSync(file, 'utf8');

// 1. First, let's fix any mangled code from the previous run
content = content.replace(/await agent\.execute\({nput, this\.fastRuntime\)/g, 'await agent.execute(input, this.fastRuntime)');
content = content.replace(/generateStrategyWithSource\(time\);execute\(input/g, 'generateStrategyWithSource(this.brainRuntime, strategyInput');

// 2. Assign runtimes correctly to each agent execution
// We'll search for the agentOutcome recording to identify which agent is executing

// Goal Interpreter (Interpret) -> fastRuntime
content = content.replace(
  /agent\.execute\(input, this\.(?:runtime|brainRuntime|fastRuntime)\);\s*this\.recordAgentOutcome\('goal-interpreter'/,
  "agent.execute(input, this.fastRuntime);\n        this.recordAgentOutcome('goal-interpreter'"
);

// Clarifier (Clarify) -> brainRuntime
content = content.replace(
  /agent\.execute\(input, this\.(?:runtime|brainRuntime|fastRuntime)\)\);\s*this\.recordAgentOutcome\('clarifier'/,
  "agent.execute(input, this.brainRuntime)));\n        this.recordAgentOutcome('clarifier'"
);

// Planner (Plan) -> brainRuntime
content = content.replace(
  /generateStrategyWithSource\(\s*this\.(?:runtime|brainRuntime|fastRuntime),\s*strategyInput/,
  "generateStrategyWithSource(\n        this.brainRuntime,\n        strategyInput"
);

// Feasibility Checker (Check) -> fastRuntime
content = content.replace(
  /agent\.execute\(input, this\.(?:runtime|brainRuntime|fastRuntime)\);\s*this\.recordAgentOutcome\('feasibility-checker'/,
  "agent.execute(input, this.fastRuntime);\n        this.recordAgentOutcome('feasibility-checker'"
);

// Scheduler (Schedule) -> fastRuntime
content = content.replace(
  /agent\.execute\(input, this\.(?:runtime|brainRuntime|fastRuntime)\) as ScheduleExecutionResult;\s*this\.recordAgentOutcome\('scheduler'/,
  "agent.execute(input, this.fastRuntime) as ScheduleExecutionResult;\n        this.recordAgentOutcome('scheduler'"
);

// Critic (Critique) -> brainRuntime
content = content.replace(
  /agent\.execute\(input, this\.(?:runtime|brainRuntime|fastRuntime)\);\s*this\.recordAgentOutcome\('critic'/,
  "agent.execute(input, this.brainRuntime);\n        this.recordAgentOutcome('critic'"
);

// Planner (Revise) -> brainRuntime
// Second occurrence of generateStrategyWithSource
const parts = content.split('generateStrategyWithSource(');
if (parts.length >= 3) {
    // parts[0] is before first
    // parts[1] is after first, contains strategyInput, this.context.domainCard ?? undefined, ); ...
    // parts[2] is after second
    parts[2] = parts[2].replace(/^\s*this\.(?:runtime|brainRuntime|fastRuntime),/, '\n        this.brainRuntime,');
}
content = parts.join('generateStrategyWithSource(');

// Domain Expert -> brainRuntime
content = content.replace(
  /},\s*this\.(?:runtime|brainRuntime|fastRuntime)\);\s*this\.recordAgentOutcome\('domain-expert'/,
  "},\n        this.brainRuntime);\n        this.recordAgentOutcome('domain-expert'"
);

// Packager (Package) -> fastRuntime
content = content.replace(
  /agent\.execute\(input, this\.(?:runtime|brainRuntime|fastRuntime)\);\s*this\.recordAgentOutcome\('packager'/,
  "agent.execute(input, this.fastRuntime);\n        this.recordAgentOutcome('packager'"
);

// Also, clean up any 'this.runtime' leftovers.
content = content.replace(/this\.runtime/g, 'this.brainRuntime');

fs.writeFileSync(file, content);
console.log('Orchestrator patched successfully (v2)');
