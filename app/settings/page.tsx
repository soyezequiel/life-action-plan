import SettingsPageContent from '../../components/SettingsPageContent'
import { getDeploymentMode } from '../../src/lib/env/deployment'

export default function SettingsPage() {
  return <SettingsPageContent deploymentMode={getDeploymentMode()} />
}
