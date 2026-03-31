import fs from 'fs';

const filePath = 'f:/proyectos/planificador-vida/src/lib/pipeline/v6/orchestrator.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Patch Constructor
const oldConstructor = `  constructor(
    config: Partial<OrchestratorConfig>,
    runtime: AgentRuntime,
    runtimeLabel = 'unknown',
    debugListener?: (event: OrchestratorDebugEvent) => void,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.runtime = runtime;`;

const newConstructor = `  constructor(
    config: Partial<OrchestratorConfig>,
    brainRuntime: AgentRuntime,
    fastRuntime?: AgentRuntime,
    runtimeLabel = 'unknown',
    debugListener?: (event: OrchestratorDebugEvent) => void,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.brainRuntime = brainRuntime;
    this.fastRuntime = fastRuntime ?? brainRuntime;`;

// Patch Restore
const oldRestore = `  static restore(
    snapshot: PlanOrchestratorSnapshot,
    runtime: AgentRuntime,
    runtimeLabel = 'unknown',
    debugListener?: (event: OrchestratorDebugEvent) => void,
  ): PlanOrchestrator {
    const parsed = PlanOrchestratorSnapshotSchema.parse(snapshot);
    const orchestrator = new PlanOrchestrator(parsed.config, runtime, runtimeLabel, debugListener);`;

const newRestore = `  static restore(
    snapshot: PlanOrchestratorSnapshot,
    brainRuntime: AgentRuntime,
    fastRuntime?: AgentRuntime,
    runtimeLabel = 'unknown',
    debugListener?: (event: OrchestratorDebugEvent) => void,
  ): PlanOrchestrator {
    const parsed = PlanOrchestratorSnapshotSchema.parse(snapshot);
    const orchestrator = new PlanOrchestrator(parsed.config, brainRuntime, fastRuntime, runtimeLabel, debugListener);`;

if (content.includes(oldConstructor)) {
  content = content.replace(oldConstructor, newConstructor);
  console.log('Constructor patched');
} else {
  console.log('Constructor NOT found');
}

if (content.includes(oldRestore)) {
  content = content.replace(oldRestore, newRestore);
  console.log('Restore patched');
} else {
  console.log('Restore NOT found');
}

fs.writeFileSync(filePath, content);
