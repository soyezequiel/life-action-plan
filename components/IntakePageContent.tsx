'use client'

import { useRouter } from 'next/navigation'
import { LOCAL_PROFILE_ID_STORAGE_KEY } from '../src/lib/client/storage-keys'
import { useUserStatusContext } from '../src/lib/client/UserStatusProvider'
import IntakeExpress from './IntakeExpress'

export default function IntakePageContent() {
  const router = useRouter()
  const status = useUserStatusContext()

  return (
    <IntakeExpress
      onCancel={() => router.push('/')}
      onComplete={async (profileId, planId) => {
        // profileId is the ID of the perfil record
        // planId is the ID of the plan record
        if (profileId) {
          window.localStorage.setItem(LOCAL_PROFILE_ID_STORAGE_KEY, profileId)
        }
        
        // Refresh global user status so the Guard sees hasPlan = true
        await status.refresh()
        
        // Now navigate to dashboard
        const target = planId ? `/?planId=${encodeURIComponent(planId)}` : '/'
        router.push(target)
      }}
    />
  )
}
