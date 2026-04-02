import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import IntakePageContent from '../../components/IntakePageContent'
import { getCurrentSession } from '@/src/lib/server/request-context'

export default async function IntakePage() {
  const session = await getCurrentSession()

  if (!session) {
    redirect('/auth/signin?callbackUrl=/intake')
  }

  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <IntakePageContent />
    </Suspense>
  )
}
