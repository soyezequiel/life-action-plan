import { Suspense } from 'react'
import { auth } from '@/src/auth'
import { redirect } from 'next/navigation'
import Dashboard from '../components/Dashboard'
import { getDeploymentMode } from '../src/lib/env/deployment'

export default async function Page() {
  const session = await auth()

  if (!session) {
    redirect('/auth/signin')
  }

  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <Dashboard deploymentMode={getDeploymentMode()} />
    </Suspense>
  )
}
