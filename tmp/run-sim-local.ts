import { config } from 'dotenv'
config({ path: '.env.local' })
config({ path: '.env' })

import { getSimulationTree } from './src/lib/db/db-helpers'
import { loadOwnedWorkflow } from './app/api/_helpers'
import { runSimulationOrchestrator } from './src/lib/flow/simulation-orchestrator'
import { resolvePlanBuildExecution } from './src/lib/runtime/build-execution'
import { getProvider } from './app/api/_domain'

async function debug() {
  const workflowId = "29f6bb7f-3b61-44f6-b44a-19b192e6ee56"
  console.log("Loading tree...")
  const tree = await getSimulationTree(workflowId)
  if (!tree) throw new Error("Tree not found")

  console.log("Loading session...")
  // We need to bypass the Request object for loadOwnedWorkflow or use db directly
  // Actually let's just use the db directly
}

debug().catch(console.error)
