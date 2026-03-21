'use client'

import { useRouter } from 'next/navigation'
import IntakeExpress from './IntakeExpress'

export default function IntakePageContent() {
  const router = useRouter()

  return (
    <IntakeExpress
      onCancel={() => router.push('/')}
      onComplete={() => router.push('/')}
    />
  )
}
