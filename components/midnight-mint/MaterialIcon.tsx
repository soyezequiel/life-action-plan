'use client'

import React from 'react'

import { cn } from '@/lib/utils'

interface MaterialIconProps {
  name: string
  className?: string
  filled?: boolean
  weight?: number
}

export function MaterialIcon({ name, className, filled = false, weight = 400 }: MaterialIconProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('material-symbols-outlined inline-flex shrink-0 items-center justify-center', className)}
      style={{
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' 24`
      }}
    >
      {name}
    </span>
  )
}
