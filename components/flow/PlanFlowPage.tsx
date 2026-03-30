'use client'

import { useEffect, useState } from 'react'

import { useLapClient } from '../../src/lib/client/app-services'
import { PlanFlow } from './PlanFlow'

interface PlanFlowPageProps {
  initialProfileId?: string
  provider?: string
}

export function PlanFlowPage({ initialProfileId = '', provider = 'openai' }: PlanFlowPageProps) {
  const client = useLapClient()
  const [profileId, setProfileId] = useState(initialProfileId)
  const [loadingProfile, setLoadingProfile] = useState(initialProfileId.trim().length === 0)

  useEffect(() => {
    let active = true

    if (initialProfileId.trim().length > 0) {
      setProfileId(initialProfileId)
      setLoadingProfile(false)
      return () => {
        active = false
      }
    }

    void client.profile.latest()
      .then((latestProfileId) => {
        if (!active) {
          return
        }

        setProfileId(latestProfileId ?? '')
      })
      .catch(() => {
        if (!active) {
          return
        }

        setProfileId('')
      })
      .finally(() => {
        if (active) {
          setLoadingProfile(false)
        }
      })

    return () => {
      active = false
    }
  }, [client, initialProfileId])

  return (
    <main className="app-shell dashboard-shell">
      <div className="view-layer">
        {loadingProfile ? (
          <section style={{ width: 'min(100%, 720px)', margin: '0 auto' }}>
            <div className="app-screen app-screen--card app-screen--compact">
              <p className="app-copy">Preparando tu plan...</p>
            </div>
          </section>
        ) : (
          <PlanFlow profileId={profileId} provider={provider} />
        )}
      </div>
    </main>
  )
}
