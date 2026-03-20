'use client'

import { useRouter } from 'next/navigation'
import { t } from '../../src/i18n'
import IntakeExpress from '../../components/IntakeExpress'

export default function IntakePage() {
  const router = useRouter()

  return (
    <div className="app-shell app-shell--centered">
      <div style={{ position: 'fixed', top: '1rem', left: '1rem', zIndex: 2 }}>
        <button className="app-button app-button--secondary" onClick={() => router.push('/')}>
          {t('ui.close')}
        </button>
      </div>
      <IntakeExpress onComplete={() => router.push('/')} />
    </div>
  )
}
