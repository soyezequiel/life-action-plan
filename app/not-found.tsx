import Link from 'next/link'

import { t } from '../src/i18n'

export default function NotFound() {
  return (
    <main style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <div style={{ maxWidth: '32rem' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>
          {t('errors.plan_not_found')}
        </h1>
        <p style={{ marginBottom: '1.5rem' }}>
          {t('errors.generic')}
        </p>
        <Link href="/">
          {t('flow.actions.go_dashboard')}
        </Link>
      </div>
    </main>
  )
}
