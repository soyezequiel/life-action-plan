
const { initializeSimTree, expandNodeChildren } = require('../src/lib/flow/simulation-tree-builder')
const { runSimulationOrchestrator } = require('../src/lib/flow/simulation-orchestrator')
const { DateTime } = require('luxon')

// Configuración básica
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
    calendario: { 
        horasLibresEstimadas: { diasLaborales: 4, diasDescanso: 6 },
        monday: { morning: true, afternoon: false, evening: true } 
    },
    patronesEnergia: { cronotipo: "vespertino" },
    problemasActuales: [],
    motivacion: { tendencias: [] },
    dependientes: [],
    condicionesSalud: [],
    patronesConocidos: { tendencias: [], diaTipicoBueno: '', diaTipicoMalo: '' }
  }]
}

const goals = [
  { id: "g1", text: "Aprender Alemán", horizonMonths: 12, hoursPerWeek: 10, priority: 1 },
  { id: "g2", text: "Trámites Visa", horizonMonths: 6, hoursPerWeek: 5, priority: 2 }
]

const realityCheck = { availableHours: 20 }

const mockRuntime = {
  newContext: () => mockRuntime,
  chat: async (messages) => {
    const system = messages.find(m => m.role === 'system')?.content
    const user = messages.find(m => m.role === 'user')?.content
    
    if (system?.includes("simulador de entorno")) {
      console.log("\n[WORLD AGENT] Granularity in Prompt check:")
      console.log("- Includes labeled period?", system?.includes("enero 2026") || system?.includes("month-1"))
      console.log("- Includes active goals?", system?.includes("Aprender Alemán"))
      console.log("- Includes reference scale?", system?.includes("ESCALA DE REFERENCIA"))
      
      return { content: JSON.stringify({
        disruptions: [{ id: "d-1", type: "energy_drop", description: "Cansancio", impactHours: 2, affectedGoalIds: ["g1"] }],
        environmentSummary: "Entorno desafiante",
        difficultyScore: 5
      })}
    }
    
    if (system?.includes("simulador de decisiones")) {
      if (user?.includes("STEP 3")) {
          console.log("\n[USER AGENT] JSON Response check:")
          return { content: JSON.stringify({
            responses: [],
            actualHours: 8,
            qualityScore: 80,
            goalBreakdown: { "g1": { plannedHours: 10, requiredHours: 10, actualHours: 8, status: "behind" } },
            personalFindings: []
          })}
      }
      return { content: "Razonando o Decidiendo..." }
    }

    if (system?.includes("psicólogo conductual")) {
        return { content: JSON.stringify({
            name: "Ezequiel", personalityType: "disciplinado", energyPattern: "vespertino", stressResponse: "enfrenta",
            motivationStyle: "intrinseca", strengths: [], weaknesses: [], likelyFailurePoints: [], narrative: "Persona de prueba",
            age: 30, occupation: "Freelancer", energyPattern: "matutino", stressResponse: "evita", 
            motivationStyle: "intrinseca", strengths: ["X"], weaknesses: ["Y"], likelyFailurePoints: ["Z"],
            dependents: 0, healthConditions: [], weekdayFreeHours: 4, weekendFreeHours: 6
        })}
    }
    return { content: "{}" }
  }
}

async function run() {
  console.log("1. Tree Initialization...")
  let tree = initializeSimTree({ workflowId: "test-wf", strategy, profile, goals, realityCheck })
  
  console.log("\n2. Granularity Escalation...")
  // Month 1
  tree = expandNodeChildren(tree, 'month-1', { strategy, profile, goals })
  const weeks = Object.keys(tree.nodes).filter(id => id.startsWith('week-'))
  console.log("- Month expanded to weeks count:", weeks.length)
  
  // Week 1 -> Day
  tree = expandNodeChildren(tree, weeks[0], { strategy, profile, goals })
  const days = Object.keys(tree.nodes).filter(id => id.startsWith('day-'))
  console.log("- Week expanded to days count:", days.length)
  console.log("- First Day Slot check:", tree.nodes[days[0]].timeSlot)

  console.log("\n3. Orchestration Simulation (Month 1)...")
  await runSimulationOrchestrator({
    runtime: mockRuntime,
    traceId: "test-trace",
    tree,
    targetNodeIds: ['month-1'],
    strategy,
    realityCheck,
    profile,
    goals,
    workflowId: "test-wf",
    onProgress: (p) => {}
  })
}

run().catch(e => console.error(e))
