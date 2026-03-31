import { Suspense } from 'react'
import IntakePageContent from '../../components/IntakePageContent'

export default function IntakePage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <IntakePageContent />
    </Suspense>
  )
}
