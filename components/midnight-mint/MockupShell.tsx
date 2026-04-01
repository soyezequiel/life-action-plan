'use client'

import React from 'react'

import { MockupOrchestrator } from './MockupOrchestrator'
import type { MockupShellProps } from './mockup-shell.types'

export type { MockupNavItem, MockupPrimaryAction, MockupShellProps, MockupTopTab } from './mockup-shell.types'

// Temporary compatibility wrapper while consumers migrate to MockupOrchestrator.
export function MockupShell(props: MockupShellProps) {
  return <MockupOrchestrator {...props} />
}
