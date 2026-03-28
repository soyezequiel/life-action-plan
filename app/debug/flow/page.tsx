'use client'

import React from 'react'
import { FlowViewer } from '@components/debug/FlowViewer'

export default function FlowDebugPage() {
  return (
    <main className="view-layer" style={{ padding: '20px', backgroundColor: '#0e0e0e', minHeight: '100dvh' }}>
      <div 
        className="app-screen--card" 
        style={{ width: '100%', height: 'calc(100dvh - 40px)', padding: 0, overflow: 'hidden' }}
      >
        <FlowViewer />
      </div>
    </main>
  )
}
