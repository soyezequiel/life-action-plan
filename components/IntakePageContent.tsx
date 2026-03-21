'use client'

import { useRouter } from 'next/navigation'
import { LOCAL_PROFILE_ID_STORAGE_KEY } from '../src/lib/client/storage-keys'
import IntakeExpress from './IntakeExpress'

export default function IntakePageContent() {
  const router = useRouter()

  return (
    <IntakeExpress
      onCancel={() => router.push('/')}
      onComplete={(profileId) => {
        window.localStorage.setItem(LOCAL_PROFILE_ID_STORAGE_KEY, profileId)
        router.push('/')
      }}
    />
  )
}
