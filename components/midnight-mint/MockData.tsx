import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface MockDataProps {
  children: ReactNode
  className?: string
  /**
   * If true, changes the display behavior to block or flex depending on the wrapper.
   * By default, it acts inline-block.
   */
  block?: boolean
}

/**
 * A wrapper component designed to visually demarcate placeholder (mock) data from
 * the permanent application user interface. It applies a subtle dashed amber outline
 * and background to make it explicitly clear that the contents are static and pending
 * real backend integration.
 *
 * When the real data is hooked up, simply remove this wrapper.
 */
export function MockData({ children, className, block = false }: MockDataProps) {
  return (
    <span
      className={cn(
        'rounded-sm bg-amber-100/40 px-1 py-0.5 outline outline-1 outline-dashed outline-amber-400/60 text-inherit transition-colors hover:bg-amber-100/60',
        block ? 'block w-full' : 'inline-block',
        className
      )}
      title="Dato estático (Placeholder)"
    >
      {children}
    </span>
  )
}
