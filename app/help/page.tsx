import Link from 'next/link'
import { auth } from '@/src/auth'
import { t } from '@/src/i18n'
import { redirect } from 'next/navigation'
import { PageFrame } from '../../components/layout/PageFrame'

const HELP_TOPICS = [
  {
    title: 'help.topic.plan.title',
    copy: 'help.topic.plan.copy'
  },
  {
    title: 'help.topic.progress.title',
    copy: 'help.topic.progress.copy'
  },
  {
    title: 'help.topic.calendar.title',
    copy: 'help.topic.calendar.copy'
  },
  {
    title: 'help.topic.settings.title',
    copy: 'help.topic.settings.copy'
  }
] as const

export default async function HelpPage() {
  const session = await auth()

  if (!session) {
    redirect('/auth/signin?callbackUrl=/help')
  }

  return (
    <PageFrame
      eyebrow={t('help.eyebrow')}
      title={t('help.title')}
      copy={t('help.copy')}
      actions={(
        <Link href="/" className="app-button app-button--secondary">
          {t('help.back')}
        </Link>
      )}
    >
      <div className="grid gap-4 xl:grid-cols-2">
        {HELP_TOPICS.map((topic) => (
          <article key={topic.title} className="rounded-[30px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.88)] p-6 shadow-[0_22px_46px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{t(topic.title)}</span>
            <p className="mt-3 text-[15px] leading-7 text-slate-500">{t(topic.copy)}</p>
          </article>
        ))}
      </div>
    </PageFrame>
  )
}
