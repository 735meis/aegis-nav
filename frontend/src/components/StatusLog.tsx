import { useEffect, useRef } from 'react'

const C = {
  bgPanel: '#08080f',
  green:   '#00ff88',
  amber:   '#ffaa00',
  red:     '#ff2222',
  cyan:    '#00ccff',
  textDim: '#4a5568',
  border:  '#1a1a2e',
}

export type LogType = 'INFO' | 'WARN' | 'QUANTUM' | 'ERROR'

export interface LogEntry {
  ts:   string
  type: LogType
  text: string
}

const TYPE_COLOR: Record<LogType, string> = {
  INFO:    '#4a9eff',
  WARN:    C.amber,
  QUANTUM: C.green,
  ERROR:   C.red,
}

function LogLine({ entry }: { entry: LogEntry }) {
  return (
    <div style={{ fontSize: 11, display: 'flex', gap: 10, alignItems: 'baseline', flexShrink: 0 }}>
      <span style={{ color: '#2d3748', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
        {entry.ts}
      </span>
      <span style={{ color: TYPE_COLOR[entry.type], flexShrink: 0, minWidth: 64 }}>
        [{entry.type}]
      </span>
      <span style={{ color: '#718096' }}>{entry.text}</span>
    </div>
  )
}

interface StatusLogProps {
  entries: LogEntry[]
}

export default function StatusLog({ entries }: StatusLogProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  return (
    <footer style={{
      height: 140,
      background: C.bgPanel,
      borderTop: `1px solid ${C.border}`,
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Log header bar */}
      <div style={{
        padding: '6px 16px 4px',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 8,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 9, letterSpacing: 3, color: C.textDim }}>SYSTEM LOG</span>
        <span style={{ fontSize: 9, color: C.textDim }}>▶</span>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: C.green, boxShadow: `0 0 4px ${C.green}`,
          animation: 'pulse 2s infinite',
        }} />
        <span style={{ marginLeft: 'auto', fontSize: 9, color: C.textDim }}>
          {entries.length} ENTRIES
        </span>
      </div>

      {/* Scrollable log entries */}
      <div
        className="terminal-scroll"
        style={{
          flex: 1, overflowY: 'auto',
          padding: '6px 16px',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}
      >
        {entries.map((entry, i) => (
          <LogLine key={i} entry={entry} />
        ))}
        <div ref={endRef} />
      </div>
    </footer>
  )
}
