import { Suspense } from 'react'
import Dashboard from '../components/Dashboard'
import { getDeploymentMode } from '../src/lib/env/deployment'

export default function Page() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <Dashboard deploymentMode={getDeploymentMode()} />
    </Suspense>
  )
}
