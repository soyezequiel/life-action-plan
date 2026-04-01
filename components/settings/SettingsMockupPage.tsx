import ResourceProviderMockup from '../mockups/ResourceProviderMockup'
import type { WalletStatus } from '../../src/shared/types/lap-api'

export type SettingsMockupSection = 'backend' | 'wallet'

interface SettingsMockupPageProps {
  section: SettingsMockupSection
  initialWalletStatus?: WalletStatus | null
  initialApiConfigured?: boolean
}

export default function SettingsMockupPage({
  section,
  initialWalletStatus,
  initialApiConfigured = false
}: SettingsMockupPageProps) {
  // Now we use a unified resource provider selection that defaults to Wallet
  void section
  return <ResourceProviderMockup initialWalletStatus={initialWalletStatus} initialApiConfigured={initialApiConfigured} />
}
