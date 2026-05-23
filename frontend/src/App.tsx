import { useState, useEffect } from 'react'
import './App.css'
import SpaceGrid, { type HazardNode, type RouteNode } from './components/SpaceGrid'
import StatusLog, { type LogEntry } from './components/StatusLog'

const API = 'http://localhost:8000'

// ── Color tokens ──────────────────────────────────────────────────────────────
const C = {
  bg:       '#03030a',
  bgPanel:  '#08080f',
  green:    '#00ff88',
  red:      '#ff2222',
  cyan:     '#00ccff',
  amber:    '#ffaa00',
  text:     '#c8d0e0',
  textDim:  '#4a5568',
  border:   '#1a1a2e',
}

// ── Mission state ─────────────────────────────────────────────────────────────

type MissionPhase =
  | 'NOMINAL'
  | 'BLACKOUT'
  | 'CLASSIFYING'
  | 'STAR_LOCKED'
  | 'FETCHING_HAZARDS'
  | 'ROUTING'
  | 'ROUTE_COMPLETE'

interface StarResult {
  target_star:    { x: number; y: number }
  star_name:      string
  classification: string
  confidence:     number
  quantum_depth:  number
  qubits_used:    number
  mode:           string
}


// ── Teammate stub hooks — wire your endpoints here ────────────────────────────

async function fetchHazards(): Promise<HazardNode[]> {
  const res  = await fetch(`${API}/api/get-hazards`)
  const data = await res.json()
  return data.hazards ?? []
}

async function fetchQuantumRoute(
  _start:   { x: number; y: number },
  _end:     { x: number; y: number },
  _hazards: HazardNode[],
): Promise<RouteNode[]> {
  const res  = await fetch(`${API}/api/get-route`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ start: _start, target: _end, hazards: _hazards }),
  })
  const data = await res.json()
  return data.route ?? []
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

const nowTs = () => new Date().toTimeString().slice(0, 8)

function phaseStatus(phase: MissionPhase): { color: string; text: string; flash: boolean } {
  switch (phase) {
    case 'NOMINAL':          return { color: C.green, text: 'MISSION STATUS: NOMINAL',                       flash: false }
    case 'BLACKOUT':         return { color: C.red,   text: '⚠  COMMS SEVERED — EMERGENCY OVERRIDE  ⚠',     flash: true  }
    case 'CLASSIFYING':      return { color: C.amber, text: 'QUANTUM BRAIN ACTIVE — CLASSIFYING TARGETS',    flash: false }
    case 'STAR_LOCKED':      return { color: C.green, text: 'TARGET LOCKED — SCANNING DEBRIS FIELD',         flash: false }
    case 'FETCHING_HAZARDS': return { color: C.amber, text: 'MAPPING DEBRIS FIELD — NASA FEED ACTIVE',       flash: false }
    case 'ROUTING':          return { color: C.amber, text: 'QAOA OPTIMIZING ESCAPE TRAJECTORY...',          flash: false }
    case 'ROUTE_COMPLETE':   return { color: C.green, text: 'ROUTE COMPUTED — SAFE CORRIDOR ESTABLISHED',    flash: false }
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function HeaderBar({ phase, clock }: { phase: MissionPhase; clock: string }) {
  const { color, text, flash } = phaseStatus(phase)
  return (
    <header style={{
      background: C.bgPanel, borderBottom: `1px solid ${C.border}`,
      padding: '10px 24px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 20, color: C.cyan, textShadow: `0 0 10px ${C.cyan}` }}>◈</span>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: 4, color: C.cyan, textShadow: `0 0 10px ${C.cyan}` }}>
          AEGIS-NAV
        </span>
        <span style={{ color: C.textDim, fontSize: 12 }}>///</span>
        <span style={{ fontSize: 11, letterSpacing: 2, color: C.textDim }}>
          QUANTUM EMERGENCY ROUTER v1.0
        </span>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '4px 16px',
        border: `1px solid ${color}44`,
        borderRadius: 2,
        background: `${color}0a`,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: color, boxShadow: `0 0 6px ${color}`,
          animation: flash ? 'blink 0.8s step-end infinite' : 'pulse 2s infinite',
        }} />
        <span style={{
          fontSize: 11, letterSpacing: 3, color,
          textShadow: `0 0 8px ${color}`,
          animation: flash ? 'blink 0.8s step-end infinite' : 'none',
        }}>
          {text}
        </span>
      </div>

      <div style={{ fontSize: 12, letterSpacing: 1, color: C.textDim, fontVariantNumeric: 'tabular-nums' }}>
        {clock}
      </div>
    </header>
  )
}

function TelemetryRow({ label, value, valueColor }: {
  label: string; value: string; valueColor?: string
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '5px 0', borderBottom: `1px solid ${C.border}`,
    }}>
      <span style={{ fontSize: 10, letterSpacing: 2, color: C.textDim }}>{label}</span>
      <span style={{ fontSize: 12, color: valueColor ?? C.text, textAlign: 'right', maxWidth: '55%' }}>
        {value}
      </span>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9, letterSpacing: 4, color: C.textDim,
      borderBottom: `1px solid ${C.border}`,
      paddingBottom: 6, marginBottom: 10, marginTop: 16,
    }}>
      {children}
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [clock,   setClock]   = useState('')
  const [phase,   setPhase]   = useState<MissionPhase>('NOMINAL')
  const [star,    setStar]    = useState<StarResult | null>(null)
  const [hazards, setHazards] = useState<HazardNode[]>([])
  const [route,   setRoute]   = useState<RouteNode[]>([])
  const [log,     setLog]     = useState<LogEntry[]>([
    { ts: nowTs(), type: 'INFO',    text: 'Aegis-Nav quantum navigation system initialized.' },
    { ts: nowTs(), type: 'QUANTUM', text: 'VQC training complete on local AerSimulator (2 qubits, depth 2).' },
    { ts: nowTs(), type: 'INFO',    text: 'Communications array nominal. Awaiting mission trigger.' },
  ])

  // Live UTC clock
  useEffect(() => {
    const tick = () => setClock(new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC')
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const addLog = (type: LogEntry['type'], text: string) =>
    setLog(prev => [...prev, { ts: nowTs(), type, text }])

  // ── Emergency pipeline ─────────────────────────────────────────────────────
  async function triggerEmergency() {
    // ── Phase: BLACKOUT ──
    setPhase('BLACKOUT')
    addLog('WARN',    'SOLAR FLARE DETECTED. Severing uplink to Earth...')
    addLog('ERROR',   'COMMS ARRAY OFFLINE. Radio blackout confirmed.')
    await delay(900)

    // ── Phase: CLASSIFYING ──
    setPhase('CLASSIFYING')
    addLog('QUANTUM', 'Initializing on-board Quantum Variational Classifier...')
    addLog('QUANTUM', 'Encoding stellar telemetry via ZZFeatureMap (2 qubits)...')

    let starResult: StarResult
    try {
      const res  = await fetch(`${API}/api/classify-star`)
      const data = await res.json()
      starResult = data
    } catch {
      addLog('ERROR', 'Backend unreachable. Is uvicorn running on port 8000?')
      setPhase('NOMINAL')
      return
    }

    setStar(starResult)
    addLog('QUANTUM', `VQC classification complete — mode: ${starResult.mode}`)
    addLog('QUANTUM', `Result: ${starResult.classification} (${Math.round(starResult.confidence * 100)}% confidence)`)
    addLog('INFO',    `Safe-harbor locked: ${starResult.star_name} at grid (${starResult.target_star.x}, ${starResult.target_star.y})`)
    await delay(600)

    // ── Phase: STAR_LOCKED ──
    setPhase('STAR_LOCKED')
    await delay(500)

    // ── Phase: FETCHING_HAZARDS (teammate stub) ──
    setPhase('FETCHING_HAZARDS')
    addLog('INFO', 'Querying NASA NeoWs real-time asteroid feed...')
    const fetchedHazards = await fetchHazards()
    setHazards(fetchedHazards)
    if (fetchedHazards.length > 0) {
      addLog('WARN', `${fetchedHazards.length} hazard node(s) mapped onto sector grid.`)
    } else {
      addLog('INFO', 'Hazard feed pending — teammate module not yet connected.')
    }
    await delay(500)

    // ── Phase: ROUTING (teammate stub) ──
    setPhase('ROUTING')
    addLog('INFO',    'Formulating QUBO problem matrix...')
    addLog('QUANTUM', 'Running QAOA on local AerSimulator...')
    const fetchedRoute = await fetchQuantumRoute(
      { x: 10, y: 50 },
      starResult.target_star,
      fetchedHazards,
    )
    setRoute(fetchedRoute)
    if (fetchedRoute.length > 0) {
      addLog('QUANTUM', `Optimal escape trajectory computed — ${fetchedRoute.length} waypoints.`)
    } else {
      addLog('INFO', 'Route optimizer pending — teammate module not yet connected.')
    }
    await delay(400)

    // ── Phase: ROUTE_COMPLETE ──
    setPhase('ROUTE_COMPLETE')
    addLog('INFO', 'All quantum pipeline stages complete.')
    addLog('INFO', 'Safe corridor established. Initiating evasive burn sequence.')
  }

  // ── Derived display values ─────────────────────────────────────────────────
  const isActive    = phase !== 'NOMINAL'
  const isScanning  = phase === 'CLASSIFYING'
  const gridOverlay = phase === 'NOMINAL'
    ? 'AWAITING QUANTUM SCAN...'
    : phase === 'ROUTE_COMPLETE'
    ? 'SAFE CORRIDOR ESTABLISHED'
    : null

  const targetForGrid = star
    ? { x: star.target_star.x, y: star.target_star.y, name: star.star_name }
    : null

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      background: C.bg, fontFamily: "'Courier New', Courier, monospace",
      color: C.text, overflow: 'hidden',
    }}>

      {/* ── Header ── */}
      <HeaderBar phase={phase} clock={clock} />

      {/* ── Main content row ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left: Telemetry + Controls ── */}
        <aside style={{
          width: 280, flexShrink: 0,
          background: C.bgPanel, borderRight: `1px solid ${C.border}`,
          display: 'flex', flexDirection: 'column',
          padding: '16px 20px', overflowY: 'auto',
        }}>

          <SectionLabel>VESSEL TELEMETRY</SectionLabel>
          <TelemetryRow label="SHIP ID"        value="AEG-7X // DEEP PROBE" />
          <TelemetryRow label="POSITION"       value="(10, 50)" valueColor={C.cyan} />
          <TelemetryRow label="COMMS STATUS"
            value={isActive ? 'OFFLINE' : 'NOMINAL'}
            valueColor={isActive ? C.red : C.green}
          />
          <TelemetryRow label="HULL INTEGRITY" value="97.4%" valueColor={C.green} />

          <SectionLabel>QUANTUM PIPELINE — PRONG 1</SectionLabel>
          <TelemetryRow label="VQC STATUS"
            value={isScanning ? 'RUNNING...' : star ? 'COMPLETE' : 'TRAINED / READY'}
            valueColor={isScanning ? C.amber : star ? C.green : C.green}
          />
          <TelemetryRow label="QUBITS USED"    value={star ? String(star.qubits_used)    : '—'} />
          <TelemetryRow label="CIRCUIT DEPTH"  value={star ? String(star.quantum_depth)  : '—'} />
          <TelemetryRow label="CLASSIFICATION"
            value={star ? star.classification : '—'}
            valueColor={star ? C.green : undefined}
          />
          <TelemetryRow label="CONFIDENCE"
            value={star ? `${Math.round(star.confidence * 100)}%` : '—'}
            valueColor={star ? C.green : undefined}
          />
          <TelemetryRow label="TARGET STAR"
            value={star ? star.star_name : '—'}
            valueColor={star ? C.green : undefined}
          />
          <TelemetryRow label="COORDINATES"
            value={star ? `(${star.target_star.x}, ${star.target_star.y})` : '—'}
            valueColor={star ? C.cyan : undefined}
          />

          <SectionLabel>HAZARD MAP — PRONG 2</SectionLabel>
          <TelemetryRow label="NASA FEED"
            value={phase === 'FETCHING_HAZARDS' ? 'FETCHING...' : hazards.length > 0 ? 'ACTIVE' : 'PENDING'}
            valueColor={phase === 'FETCHING_HAZARDS' ? C.amber : hazards.length > 0 ? C.green : C.textDim}
          />
          <TelemetryRow label="THREATS MAPPED" value={hazards.length > 0 ? String(hazards.length)                              : '—'} />
          <TelemetryRow label="HIGH RISK"      value={hazards.length > 0 ? String(hazards.filter(h => h.threat === 'high').length) : '—'} />

          <SectionLabel>QAOA ROUTE — PRONG 3</SectionLabel>
          <TelemetryRow label="OPTIMIZER"
            value={phase === 'ROUTING' ? 'RUNNING...' : route.length > 0 ? 'COMPLETE' : 'PENDING'}
            valueColor={phase === 'ROUTING' ? C.amber : route.length > 0 ? C.green : C.textDim}
          />
          <TelemetryRow label="WAYPOINTS" value={route.length > 0 ? String(route.length) : '—'} />
          <TelemetryRow label="DISTANCE"  value='—' />

          <div style={{ flex: 1 }} />

          {/* ── Trigger Button ── */}
          <button
            disabled={isActive}
            onClick={triggerEmergency}
            style={{
              marginTop: 24,
              padding: '14px 10px',
              background: isActive ? `${C.red}0a` : `${C.red}22`,
              border: `2px solid ${isActive ? `${C.red}44` : C.red}`,
              borderRadius: 3,
              color: isActive ? `${C.red}66` : C.red,
              fontSize: 11,
              fontFamily: 'inherit',
              fontWeight: 700,
              letterSpacing: 2,
              cursor: isActive ? 'not-allowed' : 'pointer',
              textShadow: isActive ? 'none' : `0 0 8px ${C.red}`,
              boxShadow: isActive ? 'none' : `0 0 12px ${C.red}44, inset 0 0 12px ${C.red}11`,
              transition: 'all 0.3s',
              lineHeight: 1.6,
            }}
          >
            {isActive
              ? '◈ QUANTUM BRAIN ACTIVE'
              : <><span>⚠ SIMULATE COMMS BLACKOUT</span><br /><span>&amp; DEBRIS CASCADE</span></>
            }
          </button>
        </aside>

        {/* ── Right: Space Grid Viewport ── */}
        <main style={{
          flex: 1, background: C.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          <SpaceGrid
            shipPosition={{ x: 10, y: 50 }}
            targetStar={targetForGrid}
            hazards={hazards}
            route={route}
            scanning={isScanning}
          />

          <div style={{ position: 'absolute', top: 16, left: 16, fontSize: 9, letterSpacing: 3, color: C.textDim }}>
            SECTOR MAP // 100×100 UNIT GRID
          </div>

          {gridOverlay && (
            <div style={{
              position: 'absolute', bottom: 16, right: 16,
              fontSize: 9, letterSpacing: 2,
              color: phase === 'ROUTE_COMPLETE' ? C.green : C.textDim,
              textShadow: phase === 'ROUTE_COMPLETE' ? `0 0 8px ${C.green}` : 'none',
            }}>
              {gridOverlay}
            </div>
          )}
        </main>
      </div>

      <StatusLog entries={log} />
    </div>
  )
}
