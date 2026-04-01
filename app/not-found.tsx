import Link from 'next/link'

import { PageFrame } from '../components/layout/PageFrame'
import { t } from '../src/i18n'

export default function NotFound() {
  return (
    <PageFrame
      eyebrow={t('help.eyebrow')}
      title={t('errors.plan_not_found')}
      copy={t('errors.generic')}
      actions={(
        <Link href="/" className="app-button app-button--primary">
          {t('flow.actions.go_dashboard')}
        </Link>
      )}
    >
      <section className="rounded-[30px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.88)] p-6 shadow-[0_22px_46px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl">
        <p className="max-w-2xl text-[15px] leading-7 text-slate-500">
          {t('errors.generic')}
        </p>
      </section>
    </PageFrame>
  )
}
