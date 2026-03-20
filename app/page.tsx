import Dashboard from '../components/Dashboard'
import { getDeploymentMode } from '../src/lib/env/deployment'

export default function Page() {
  return <Dashboard deploymentMode={getDeploymentMode()} />
}
