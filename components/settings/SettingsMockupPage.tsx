import ResourceProviderMockup from '../mockups/ResourceProviderMockup'

export type SettingsMockupSection = 'backend' | 'wallet'

interface SettingsMockupPageProps {
  section: SettingsMockupSection
}

export default function SettingsMockupPage({ section }: SettingsMockupPageProps) {
  // Now we use a unified resource provider selection that defaults to Wallet
  return <ResourceProviderMockup />
}
