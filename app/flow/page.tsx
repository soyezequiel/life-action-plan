import { getDeploymentMode } from '../../src/lib/env/deployment'
import FlowPageContent from '../../components/FlowPageContent'

export default function FlowPage() {
  return <FlowPageContent deploymentMode={getDeploymentMode()} />
}
