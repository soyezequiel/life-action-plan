import { InteractiveFlowPage } from '../../../components/flow-interactive/InteractiveFlowPage'
import { getDeploymentMode } from '../../../src/lib/env/deployment'

export default function InteractiveFlowRoute() {
  return (
    <main className="app-shell dashboard-shell">
      <div className="view-layer">
        <InteractiveFlowPage deploymentMode={getDeploymentMode()} />
      </div>
    </main>
  )
}
