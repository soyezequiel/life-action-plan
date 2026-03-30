import BackendSettingsMockup from '../mockups/BackendSettingsMockup'
import WalletSettingsMockup from '../mockups/WalletSettingsMockup'

export type SettingsMockupSection = 'backend' | 'wallet'

interface SettingsMockupPageProps {
  section: SettingsMockupSection
}

export default function SettingsMockupPage({ section }: SettingsMockupPageProps) {
  if (section === 'wallet') {
    return <WalletSettingsMockup />
  }

  return <BackendSettingsMockup />
}
