'use client'

import { useEffect, useState } from 'react'
import type { JSX, MouseEvent as ReactMouseEvent } from 'react'
import { motion } from 'framer-motion'
import { t } from '../src/i18n'
import { useLapClient } from '../src/lib/client/app-services'
import { useDebugTraces } from '../src/lib/client/use-debug-traces'
import DebugTraceList from './debug/DebugTraceList'
import DebugSpanDetail from './debug/DebugSpanDetail'
import './debug/debug-panel.css'

interface DebugPanelProps {
  onClose: () => void
}

const DEFAULT_HEIGHT_RATIO = 0.4
const MIN_PANEL_HEIGHT = 200
const MAX_PANEL_HEIGHT_RATIO = 0.8
const HEIGHT_STORAGE_KEY = 'debug-panel-height'

function getPanelHeightLimit(): number {
  return Math.max(MIN_PANEL_HEIGHT, Math.floor(window.innerHeight * MAX_PANEL_HEIGHT_RATIO))
}

function clampHeight(height: number): number {
  return Math.min(Math.max(height, MIN_PANEL_HEIGHT), getPanelHeightLimit())
}

function getInitialHeight(): number {
  const storedValue = window.localStorage.getItem(HEIGHT_STORAGE_KEY)
  const parsedValue = storedValue ? Number.parseInt(storedValue, 10) : Number.NaN

  if (Number.isFinite(parsedValue)) {
    return clampHeight(parsedValue)
  }

  return clampHeight(Math.floor(window.innerHeight * DEFAULT_HEIGHT_RATIO))
}

export default function DebugPanel({ onClose }: DebugPanelProps): JSX.Element {
  const client = useLapClient()
  const { traces, selectedSpanId, selectedSpan, selectedTrace, setSelectedSpanId, clearTraces } = useDebugTraces()
  const [height, setHeight] = useState(() => getInitialHeight())

  useEffect(() => {
    void client.debug.enable().catch(() => {})

    return () => {
      client.debug.disable().catch(() => {})
    }
  }, [client])

  useEffect(() => {
    const handleWindowResize = () => {
      setHeight((current) => clampHeight(current))
    }

    window.addEventListener('resize', handleWindowResize)

    return () => {
      window.removeEventListener('resize', handleWindowResize)
    }
  }, [])

  function handleResizeStart(event: ReactMouseEvent<HTMLDivElement>): void {
    event.preventDefault()

    const originY = event.clientY
    const startHeight = height
    let lastHeight = height

    const handleMouseMove = (moveEvent: MouseEvent) => {
      lastHeight = clampHeight(startHeight + (originY - moveEvent.clientY))
      setHeight(lastHeight)
    }

    const handleMouseUp = () => {
      window.localStorage.setItem(HEIGHT_STORAGE_KEY, String(clampHeight(lastHeight)))
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <motion.aside
      className="debug-panel"
      style={{ height }}
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 28 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="debug-panel__resize-handle"
        onMouseDown={handleResizeStart}
        role="separator"
        aria-orientation="horizontal"
      />

      <header className="debug-panel__toolbar">
        <div className="debug-panel__toolbar-copy">
          <strong className="debug-panel__title">{t('debug.panel_title')}</strong>
          <span className="debug-panel__count">{t('debug.trace_count', { count: traces.length })}</span>
        </div>

        <div className="debug-panel__toolbar-actions">
          <button className="debug-panel__ghost-button" onClick={clearTraces}>
            {t('debug.clear')}
          </button>
          <button className="debug-panel__ghost-button" onClick={onClose}>
            {t('debug.disable')}
          </button>
        </div>
      </header>

      <div className="debug-panel__body">
        <section className="debug-panel__pane debug-panel__pane--list">
          <DebugTraceList
            traces={traces}
            selectedSpanId={selectedSpanId}
            onSelectSpan={setSelectedSpanId}
          />
        </section>

        <section className="debug-panel__pane debug-panel__pane--detail">
          <DebugSpanDetail trace={selectedTrace} span={selectedSpan} />
        </section>
      </div>
    </motion.aside>
  )
}
