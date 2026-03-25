import { initializeSimTree, expandNodeChildren } from '../src/lib/flow/simulation-tree-builder'
import { runSimulationOrchestrator } from '../src/lib/flow/simulation-orchestrator'
import { DateTime } from 'luxon'

// 1. Mock Data
const strategy = {
  title: "Vivir en Europa",
  summary: "Plan para emigrar en 12 meses",
  totalMonths: 12,
  phases: [
    { id: "p1", title: "Idioma y Visa", goalIds: ["g1", "g2"], startMonth: 1, endMonth: 6, hoursPerWeek: 15 }
  ]
}

const profile = {
  participantes: [{
    datosPersonales: { nombre: "Ezequiel", edad: 30, narrativaPersonal: "Freelancer" },
    calendario: { horasLibresEstimadas: { diasLaborales: 4, diasDescanso: 6 } },
    patronesEnergia: { cronotipo: "vespertino" }
  }]
} as any

const goals = [
  { id: "g1", text: "Aprender Alemán", horizonMonths: 12, hoursPerWeek: 10, priority: 1 },
  { id: "g2", text: "Trámites Visa", horizonMonths: 6, hoursPerWeek: 5, priority: 2 }
] as any

const realityCheck = { availableHours: 20 } as any

// 2. Mock Agent Runtime to intercept prompts
const mockRuntime = {
  newContext: () => mockRuntime,
  chat: async (messages: any[]) => {
    console.log("\n--- INTERCEPTED PROMPT ---")
    const system = messages.find(m => m.role === 'system')?.content
    const user = messages.find(m => m.role === 'user')?.content
    console.log("SYSTEM:", system)
    console.log("USER:", user)
    
    // Return dummy valid JSON based on what's expected
    if (system?.includes("simulador de entorno")) {
      return { content: JSON.stringify({
        disruptions: [{ id: "d-test", type: "energy_drop", description: "Cansancio", impactHours: 2, affectedGoalIds: ["g1"] }],
        environmentSummary: "Test environment",
        difficultyScore: 5
      })}
    }
    if (system?.includes("simulador de decisiones")) {
      // Handle ReACT phases
      if (user?.includes("STEP 1")) return { content: "Razonando..." }
      if (user?.includes("STEP 2")) return { content: "Decidiendo..." }
      return { content: JSON.stringify({
        responses: [],
        actualHours: 8,
        qualityScore: 80,
        goalBreakdown: { "g1": { plannedHours: 10, requiredHours: 10, actualHours: 8, status: "behind" } },
        personalFindings: []
      })}
    }
    if (system?.includes("psicólogo conductual")) {
        return { content: JSON.stringify({
            name: "Ezequiel", personalityType: "disciplinado", energyPattern: "vespertino", stressResponse: "enfrenta",
            motivationStyle: "intrinseca", strengths: [], weaknesses: [], likelyFailurePoints: [], narrative: "Test persona"
        })}
    }
    return { content: "{}" }
  }
} as any

async function runDiagnostic() {
  console.log("1. Initializing Tree...")
  let tree = initializeSimTree({ workflowId: "test-wf", strategy, profile, goals, realityCheck })
  console.log("Root nodes:", Object.keys(tree.nodes).filter(id => !id.includes('month')))
  
  console.log("\n2. Expanding Month 1...")
  tree = expandNodeChildren(tree, 'month-1', { strategy, profile, goals })
  const weeks = Object.keys(tree.nodes).filter(id => id.startsWith('week'))
  console.log("Weeks expanded:", weeks.length)

  console.log("\n3. Expanding Week 1...")
  tree = expandNodeChildren(tree, weeks[0]!, { strategy, profile, goals })
  const days = Object.keys(tree.nodes).filter(id => id.startsWith('day'))
  console.log("Days expanded:", days.length)
  console.log("Sample day node:", tree.nodes[days[0]!])

  console.log("\n4. Running Orchestrator for Month 1...")
  await runSimulationOrchestrator({
    runtime: mockRuntime,
    traceId: "trace-123",
    tree,
    targetNodeIds: ['month-1'],
    strategy,
    realityCheck,
    profile,
    goals,
    workflowId: "test-wf",
    onProgress: (p) => console.log(`Progress: ${p.stage} - ${p.message}`)
  })
}

runDiagnostic().catch(console.error)
