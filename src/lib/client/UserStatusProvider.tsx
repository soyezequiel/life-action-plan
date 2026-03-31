'use client'

import React, { createContext, useContext, ReactNode } from 'react'
import { useUserStatus, UserStatus } from './use-user-status'

const UserStatusContext = createContext<UserStatus | null>(null)

export function UserStatusProvider({ children }: { children: ReactNode }) {
  const status = useUserStatus()

  return (
    <UserStatusContext.Provider value={status}>
      {children}
    </UserStatusContext.Provider>
  )
}

export function useUserStatusContext(): UserStatus {
  const context = useContext(UserStatusContext)
  if (!context) {
    throw new Error('useUserStatusContext must be used within UserStatusProvider')
  }
  return context
}
