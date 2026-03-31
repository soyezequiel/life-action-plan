import { Suspense } from 'react'
import { auth } from '@/src/auth'
import { redirect } from 'next/navigation'
import IntakePageContent from '../../components/IntakePageContent'

export default async function IntakePage() {
  const session = await auth()

  if (!session) {
    redirect('/auth/signin?callbackUrl=/intake')
  }

  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <IntakePageContent />
    </Suspense>
  )
}
