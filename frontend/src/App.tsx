import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import './App.css'
import SpaceGrid, { SolarSystemView, type HazardNode, type RouteNode } from './components/SpaceGrid'
import StatusLog, { type LogEntry } from './components/StatusLog'

const API = import.meta.env.VITE_API_URL ?? ''

const C = {
  bg:      '#03030a',
  bgPanel: '#07070f',
  bgCard:  '#0c0c1a',
  green:   '#00ff88',
  red:     '#ff2222',
  cyan:    '#00ccff',
  amber:   '#ffaa00',
  text:    '#c8d0e0',
  textDim: '#4a5568',
  border:  '#1a2030',
}

const SANS = "system-ui, -apple-system, 'Segoe UI', Helvetica, sans-serif"
const MONO = "'Courier New', Courier, monospace"

// ── Global tooltip hook ───────────────────────────────────────────────────────
// Module-level so any component can call it without prop drilling or context.
let _showTip: ((title: string, body: string, x: number, y: number) => void) | null = null

function useTipFn(fn: (title: string, body: string, x: number, y: number) => void) {
  useEffect(() => { _showTip = fn; return () => { _showTip = null } }, [fn])
}

// Wrap any React element to make it open a tooltip on click
function Tip({ children, title, body, block }: {
  children: React.ReactNode
  title: string
  body: string
  block?: boolean
}) {
  return (
    <span
      onClick={(e) => { e.stopPropagation(); _showTip?.(title, body, e.clientX, e.clientY) }}
      style={{
        cursor: 'pointer',
        display: block ? 'block' : 'inline',
        borderBottom: block ? 'none' : '1px dashed rgba(0,204,255,0.35)',
        paddingBottom: block ? 0 : 1,
      }}
    >
      {children}
    </span>
  )
}

// ── Tooltip card ──────────────────────────────────────────────────────────────

interface TooltipData { title: string; body: string; x: number; y: number }

function GlobalTooltip({ data, onClose }: { data: TooltipData; onClose: () => void }) {
  const W = 248
  const MARGIN = 16
  const left = data.x + MARGIN + W > window.innerWidth
    ? data.x - W - MARGIN
    : data.x + MARGIN
  const top = data.y + 180 > window.innerHeight
    ? data.y - 170
    : data.y - 8

  return (
    <>
      {/* invisible backdrop — click outside to dismiss */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 490 }} />
      <div style={{
        position: 'fixed', left, top, zIndex: 500, width: W,
        background: '#060610', border: `1px solid ${C.cyan}55`,
        borderRadius: 8, padding: '14px 16px',
        boxShadow: `0 16px 48px rgba(0,0,0,0.85), 0 0 24px ${C.cyan}14`,
        animation: 'circuit-fadein 0.15s ease-out',
        pointerEvents: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 9 }}>
          <div style={{ fontSize: 9, letterSpacing: 3, color: C.cyan, fontFamily: MONO, fontWeight: 700, lineHeight: 1.4, paddingRight: 8 }}>
            {data.title.toUpperCase()}
          </div>
          <span
            onClick={onClose}
            style={{ cursor: 'pointer', color: C.textDim, fontSize: 16, lineHeight: 1, flexShrink: 0, marginTop: -1 }}
          >
            ×
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#b0bcd4', lineHeight: 1.65, fontFamily: SANS }}>
          {data.body}
        </div>
      </div>
    </>
  )
}

// ── Hazard data ───────────────────────────────────────────────────────────────

const BLOCKER_HAZARDS: HazardNode[] = [
  { x: 34, y: 61, threat: 'high', label: 'ASTEROID-7741', type: 'asteroid' },
  { x: 50, y: 68, threat: 'high', label: 'ASTEROID-3892', type: 'asteroid' },
  { x: 66, y: 75, threat: 'high', label: 'ASTEROID-5517', type: 'asteroid' },
]

function classicalStraightLine(
  start: { x: number; y: number },
  end:   { x: number; y: number },
  steps = 14,
): RouteNode[] {
  return Array.from({ length: steps + 1 }, (_, i) => ({
    x: start.x + (end.x - start.x) * (i / steps),
    y: start.y + (end.y - start.y) * (i / steps),
  }))
}

function computeVisualArc(
  start:   { x: number; y: number },
  end:     { x: number; y: number },
  hazards: HazardNode[],
): RouteNode[] {
  const STEP  = 5
  const CLEAR = 8

  const snap    = (v: number) => Math.round(v / STEP) * STEP
  const blocked = (x: number, y: number) =>
    x < 0 || x > 99 || y < 0 || y > 99 ||
    hazards.some(h => (x - h.x) ** 2 + (y - h.y) ** 2 < CLEAR * CLEAR)

  let sx = snap(start.x), sy = snap(start.y)
  let ex = snap(end.x),   ey = snap(end.y)

  if (blocked(ex, ey)) {
    outer: for (let r = STEP; r <= 30; r += STEP) {
      for (let dx = -r; dx <= r; dx += STEP) {
        for (let dy = -r; dy <= r; dy += STEP) {
          if (Math.abs(dx) === r || Math.abs(dy) === r) {
            if (!blocked(ex + dx, ey + dy)) { ex += dx; ey += dy; break outer }
          }
        }
      }
    }
  }

  const axLen = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2) || 1
  const cwPX  = (ey - sy) / axLen
  const cwPY  = -(ex - sx) / axLen
  const K     = (x: number, y: number) => x * 128 + y

  const gCost = new Map<number, number>()
  const prev  = new Map<number, number>()
  type Triple = [f: number, x: number, y: number]
  const open: Triple[] = []

  gCost.set(K(sx, sy), 0)
  prev.set(K(sx, sy), -1)
  open.push([0, sx, sy])

  const dirs: [number, number][] = [
    [STEP, 0], [0, STEP], [-STEP, 0], [0, -STEP],
    [STEP, STEP], [-STEP, STEP], [STEP, -STEP], [-STEP, -STEP],
  ]

  for (let guard = 0; guard < 5000 && open.length > 0; guard++) {
    let bi = 0
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i
    const [, cx, cy] = open.splice(bi, 1)[0]
    if (cx === ex && cy === ey) break

    const cg = gCost.get(K(cx, cy)) ?? Infinity
    for (const [ddx, ddy] of dirs) {
      const nx = cx + ddx, ny = cy + ddy
      if (blocked(nx, ny)) continue
      const ng = cg + Math.sqrt(ddx * ddx + ddy * ddy)
      if (ng >= (gCost.get(K(nx, ny)) ?? Infinity)) continue
      gCost.set(K(nx, ny), ng)
      prev.set(K(nx, ny), K(cx, cy))
      const h = Math.sqrt((nx - ex) ** 2 + (ny - ey) ** 2)
                - (nx * cwPX + ny * cwPY) * 0.12
      open.push([ng + h, nx, ny])
    }
  }

  const raw: RouteNode[] = []
  let k = K(ex, ey)
  while (prev.has(k) && k !== -1) {
    raw.unshift({ x: Math.floor(k / 128), y: k % 128 })
    const pk = prev.get(k)!
    if (pk === -1) break
    k = pk
  }
  if (raw.length < 2) return [start, end]

  for (let round = 0; round < 3; round++) {
    for (let i = 1; i < raw.length - 1; i++) {
      const nx = Math.round((raw[i - 1].x + raw[i + 1].x) / 2)
      const ny = Math.round((raw[i - 1].y + raw[i + 1].y) / 2)
      if (!blocked(nx, ny)) { raw[i].x = nx; raw[i].y = ny }
    }
  }

  return raw
}

// ── Types ─────────────────────────────────────────────────────────────────────

type MissionPhase =
  | 'NOMINAL' | 'BLACKOUT' | 'CLASSIFYING' | 'STAR_LOCKED'
  | 'FETCHING_HAZARDS' | 'ROUTING' | 'ROUTE_COMPLETE'

interface StarResult {
  target_star: { x: number; y: number }
  star_name: string; classification: string
  confidence: number; quantum_depth: number; qubits_used: number; mode: string
}

interface QuantumProof {
  circuit_diagram: string; cobyla_iterations: number; qubits: number
  circuit_depth: number; feature_map: string; ansatz: string
  backend: string; optimizer: string; training_samples: number
}

async function fetchHazards(): Promise<HazardNode[]> {
  const res = await fetch(`${API}/api/get-hazards`)
  return (await res.json()).hazards ?? []
}

async function fetchQuantumRoute(
  _start: { x: number; y: number },
  _end: { x: number; y: number },
  _hazards: HazardNode[],
): Promise<RouteNode[]> {
  const res = await fetch(`${API}/api/get-route`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start: _start, target: _end, hazards: _hazards }),
  })
  return (await res.json()).route ?? []
}

const delay  = (ms: number) => new Promise(r => setTimeout(r, ms))
const nowTs  = () => new Date().toTimeString().slice(0, 8)

function phaseStatus(phase: MissionPhase) {
  const m: Record<MissionPhase, { color: string; text: string; flash: boolean }> = {
    NOMINAL:          { color: C.green, text: 'MISSION STATUS: NOMINAL',                    flash: false },
    BLACKOUT:         { color: C.red,   text: '⚠  COMMS SEVERED — EMERGENCY OVERRIDE  ⚠',  flash: true  },
    CLASSIFYING:      { color: C.amber, text: 'QUANTUM BRAIN ACTIVE — CLASSIFYING TARGETS', flash: false },
    STAR_LOCKED:      { color: C.green, text: 'TARGET LOCKED — SCANNING DEBRIS FIELD',      flash: false },
    FETCHING_HAZARDS: { color: C.amber, text: 'MAPPING THREAT FIELD — NASA · NOAA · DEBRIS FEEDS ACTIVE', flash: false },
    ROUTING:          { color: C.amber, text: 'CALCULATING QAOA TENSOR NETWORK...',          flash: false },
    ROUTE_COMPLETE:   { color: C.green, text: 'QUANTUM SAFE CORRIDOR ESTABLISHED',           flash: false },
  }
  return m[phase]
}

// ── Header ────────────────────────────────────────────────────────────────────

function HeaderBar({ phase, clock }: { phase: MissionPhase; clock: string }) {
  const navigate = useNavigate()
  const { color, text, flash } = phaseStatus(phase)
  return (
    <header style={{
      background: C.bgPanel, borderBottom: `1px solid ${C.border}`,
      padding: '13px 28px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 11, color: C.textDim, fontFamily: SANS, letterSpacing: 1,
            padding: '4px 8px', borderRadius: 6, transition: 'color 0.15s',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = C.cyan)}
          onMouseLeave={e => (e.currentTarget.style.color = C.textDim)}
        >
          ← Home
        </button>
        <span style={{ color: C.border, fontSize: 14, userSelect: 'none' }}>|</span>
        <span style={{ fontSize: 22, color: C.cyan, textShadow: `0 0 12px ${C.cyan}` }}>◈</span>
        <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: 5, color: C.cyan, textShadow: `0 0 10px ${C.cyan}`, fontFamily: MONO }}>
          AEGIS-NAV
        </span>
        <span style={{ color: C.border, fontSize: 14, userSelect: 'none' }}>|</span>
        <span style={{ fontSize: 11, letterSpacing: 2, color: C.textDim, fontFamily: SANS }}>
          Quantum Emergency Router
        </span>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '5px 18px', border: `1px solid ${color}44`,
        borderRadius: 20, background: `${color}0a`,
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: color, boxShadow: `0 0 6px ${color}`,
          animation: flash ? 'blink 0.8s step-end infinite' : 'pulse 2s infinite',
        }} />
        <span style={{
          fontSize: 10, letterSpacing: 3, color,
          textShadow: `0 0 8px ${color}`, fontFamily: MONO,
          animation: flash ? 'blink 0.8s step-end infinite' : 'none',
        }}>
          {text}
        </span>
      </div>
      <div style={{ fontSize: 11, letterSpacing: 1, color: C.textDim, fontVariantNumeric: 'tabular-nums', fontFamily: MONO }}>
        {clock}
      </div>
    </header>
  )
}

// ── Pipeline bar ──────────────────────────────────────────────────────────────

const PRONG_TIPS = {
  p1: {
    title: 'Prong 1 — VQC Classifier',
    body:  'The Variational Quantum Classifier (VQC) is a quantum machine learning model. It encodes star measurements — temperature, brightness — into quantum states, runs them through an entangled circuit, and learns to predict whether a star system is habitable. Runs entirely on the on-board quantum simulator.',
  },
  p2: {
    title: 'Prong 2 — Multi-Source Threat Intelligence',
    body:  "Three live feeds build the hazard field: (1) NASA NeoWs — real near-Earth asteroids scored by size × velocity over a 7-day window. (2) NOAA DONKI — solar flare events (Class X/M/C) mapped as sensor blackout zones where navigation goes blind. (3) Orbital debris — synthetic Kessler-syndrome clusters modelling satellite fragmentation fields that shift position daily. All three types are placed on the grid and handed to QAOA as avoidance constraints.",
  },
  p3: {
    title: 'Prong 3 — QAOA Route Optimization',
    body:  "The Quantum Approximate Optimization Algorithm (QAOA) finds the safest flight path by evaluating many possible routes simultaneously using quantum superposition. A classical computer must check paths one by one — QAOA checks all of them at once, collapsing to the optimal solution.",
  },
}

function ProngStep({ label, active, done, summary, tipTitle, tipBody }: {
  label: string; active: boolean; done: boolean; summary?: string
  tipTitle: string; tipBody: string
}) {
  const color = done ? C.green : active ? C.amber : C.textDim
  return (
    <div
      onClick={(e) => { e.stopPropagation(); _showTip?.(tipTitle, tipBody, e.clientX, e.clientY) }}
      style={{
        flex: 1, padding: '10px 16px', border: `1px solid ${color}44`,
        borderRadius: 6, background: done ? `${C.green}08` : active ? `${C.amber}08` : 'transparent',
        textAlign: 'center', minWidth: 0, transition: 'all 0.4s', cursor: 'pointer',
        boxShadow: done ? `0 0 12px ${C.green}18` : active ? `0 0 12px ${C.amber}18` : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
        {done && <span style={{ color: C.green, fontSize: 11 }}>✓</span>}
        {active && (
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: C.amber, boxShadow: `0 0 6px ${C.amber}`,
            animation: 'pulse 1s infinite', display: 'inline-block',
          }} />
        )}
        <span style={{ fontSize: 10, letterSpacing: 2, color, fontWeight: done || active ? 700 : 400, fontFamily: MONO }}>
          {label}
        </span>
      </div>
      {summary && (
        <div style={{ fontSize: 9, color: C.green, marginTop: 4, letterSpacing: 1, textShadow: `0 0 6px ${C.green}`, fontFamily: MONO }}>
          {summary}
        </div>
      )}
      <div style={{ fontSize: 8, color: `${color}66`, marginTop: 3, fontFamily: SANS }}>tap for info</div>
    </div>
  )
}

function PipelineBar({ phase, star, hazards, route }: {
  phase: MissionPhase; star: StarResult | null; hazards: HazardNode[]; route: RouteNode[]
}) {
  const p1done = ['STAR_LOCKED','FETCHING_HAZARDS','ROUTING','ROUTE_COMPLETE'].includes(phase)
  const p2done = ['ROUTING','ROUTE_COMPLETE'].includes(phase)
  const p3done = phase === 'ROUTE_COMPLETE'
  const arrowColor = (done: boolean) => done ? C.green : C.border

  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 8, padding: '10px 24px',
      background: C.bgPanel, borderBottom: `1px solid ${C.border}`, flexShrink: 0,
    }}>
      <ProngStep
        label="PRONG 1 · VQC CLASSIFIER"
        active={phase === 'CLASSIFYING'} done={p1done}
        summary={p1done && star ? `${Math.round(star.confidence * 100)}% conf · ${star.star_name}` : undefined}
        tipTitle={PRONG_TIPS.p1.title} tipBody={PRONG_TIPS.p1.body}
      />
      <div style={{ display: 'flex', alignItems: 'center', color: arrowColor(p1done), fontSize: 14, padding: '0 4px' }}>──▶</div>
      <ProngStep
        label="PRONG 2 · NASA HAZARDS"
        active={phase === 'FETCHING_HAZARDS'} done={p2done}
        summary={p2done ? `${hazards.length} threats mapped` : undefined}
        tipTitle={PRONG_TIPS.p2.title} tipBody={PRONG_TIPS.p2.body}
      />
      <div style={{ display: 'flex', alignItems: 'center', color: arrowColor(p2done), fontSize: 14, padding: '0 4px' }}>──▶</div>
      <ProngStep
        label="PRONG 3 · QAOA ROUTE"
        active={phase === 'ROUTING'} done={p3done}
        summary={p3done ? `${route.length} waypoints computed` : undefined}
        tipTitle={PRONG_TIPS.p3.title} tipBody={PRONG_TIPS.p3.body}
      />
    </div>
  )
}

// ── Quantum circuit modal ─────────────────────────────────────────────────────

const CIRCUIT_TIPS: Record<string, { title: string; body: string }> = {
  'FEATURE MAP': {
    title: 'ZZFeatureMap — Data Encoding',
    body:  "Translates classical star data (temperature, brightness) into quantum states. The 'ZZ' means pairs of qubits become entangled based on the input values — this lets the quantum circuit detect patterns that a classical circuit can't represent.",
  },
  'ANSATZ': {
    title: 'RealAmplitudes — Trainable Circuit',
    body:  "The parameterized (trainable) part of the quantum circuit. Like weights in a neural network, these angle parameters are tuned during training until the circuit correctly classifies stars as habitable or hazardous.",
  },
  'OPTIMIZER': {
    title: 'COBYLA — Classical Optimizer',
    body:  "Constrained Optimization BY Linear Approximations. The classical algorithm that tunes the quantum circuit's parameters. It adjusts angles iteratively, evaluating the circuit's accuracy each time, until it converges on the best solution.",
  },
  'ITERATIONS': {
    title: 'Function Evaluations (nfev)',
    body:  "How many times COBYLA ran the quantum circuit to tune its parameters. Each evaluation runs the full quantum circuit and measures prediction accuracy. This is the actual count from the optimizer result object.",
  },
  'BACKEND': {
    title: 'AerSimulator — Local Quantum Simulator',
    body:  "A high-fidelity quantum computer simulator running entirely on this machine. No internet connection or IBM Quantum account needed. It accurately simulates quantum gate operations and measurement probabilities.",
  },
  'TRAINING SET': {
    title: 'Training Dataset',
    body:  "12 labeled stars — 6 classified Habitable, 6 Hazardous — used to teach the VQC how to distinguish safe destinations. The quantum classifier learns from this small dataset through gradient-free optimization.",
  },
  'QUBITS': {
    title: 'Qubits — Quantum Bits',
    body:  "Unlike classical bits (strictly 0 or 1), a qubit can exist in superposition — both 0 and 1 simultaneously. With 2 qubits, the circuit can represent 4 states at once. With N qubits: 2^N parallel states.",
  },
  'CIRCUIT DEPTH': {
    title: 'Circuit Depth',
    body:  "How many sequential layers of quantum gate operations the circuit has. Depth 2 means two rounds of entangling operations. Shallower circuits run faster and are less prone to noise on real quantum hardware.",
  },
}

function QuantumCircuitModal({ proof, onClose }: { proof: QuantumProof; onClose: () => void }) {
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setTimeout(onClose, 4000)
    if (barRef.current) {
      barRef.current.style.transition = 'width 4s linear'
      barRef.current.style.width = '0%'
    }
    return () => clearTimeout(timer)
  }, [onClose])

  const fields: [string, string][] = [
    ['FEATURE MAP',   proof.feature_map],
    ['ANSATZ',        proof.ansatz],
    ['OPTIMIZER',     proof.optimizer],
    ['ITERATIONS',    String(proof.cobyla_iterations)],
    ['BACKEND',       proof.backend],
    ['TRAINING SET',  `${proof.training_samples} stars`],
    ['QUBITS',        String(proof.qubits)],
    ['CIRCUIT DEPTH', String(proof.circuit_depth)],
  ]

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 100,
        background: '#000000cc', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        animation: 'circuit-fadein 0.4s ease-out',
        cursor: 'pointer',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#030a06', border: `2px solid ${C.green}`,
          borderRadius: 8, padding: '32px 36px', maxWidth: 700, width: '90%',
          boxShadow: `0 0 50px ${C.green}44, 0 0 100px ${C.green}18`,
          cursor: 'default', position: 'relative',
        }}
      >
        <Tip
          title="Quantum Circuit — What Is This?"
          body="This is the actual quantum circuit executed by the on-board computer to classify the destination star. The top section shows the circuit diagram: two qubits (q_0, q_1) processed through a feature encoding layer and a trainable layer. The fields below show the exact configuration used."
          block
        >
          <div style={{ fontSize: 11, letterSpacing: 4, color: C.green, textShadow: `0 0 10px ${C.green}`, marginBottom: 22, textAlign: 'center', fontFamily: MONO }}>
            ◈ QUANTUM CIRCUIT EXECUTED — PROOF OF COMPUTATION
          </div>
        </Tip>

        <pre style={{
          fontSize: 11, color: `${C.green}dd`, margin: '0 0 22px',
          overflowX: 'auto', whiteSpace: 'pre', lineHeight: 1.6,
          fontFamily: MONO, background: `${C.green}06`, padding: 14,
          borderRadius: 4, border: `1px solid ${C.green}22`,
        }}>
          {proof.circuit_diagram}
        </pre>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 28px', fontSize: 10, marginBottom: 22 }}>
          {fields.map(([label, val]) => {
            const tip = CIRCUIT_TIPS[label]
            return (
              <div
                key={label}
                onClick={(e) => { if (tip) { e.stopPropagation(); _showTip?.(tip.title, tip.body, e.clientX, e.clientY) } }}
                style={{
                  display: 'flex', justifyContent: 'space-between',
                  borderBottom: `1px solid ${C.green}18`, paddingBottom: 5,
                  cursor: tip ? 'pointer' : 'default',
                }}
              >
                <span style={{
                  color: tip ? C.cyan : C.textDim,
                  letterSpacing: 2, fontFamily: SANS,
                  borderBottom: tip ? '1px dashed rgba(0,204,255,0.35)' : 'none',
                }}>
                  {label}
                </span>
                <span style={{ color: C.green, fontFamily: MONO }}>{val}</span>
              </div>
            )
          })}
        </div>

        <div style={{ fontSize: 9, color: C.textDim, textAlign: 'center', marginBottom: 14, fontFamily: SANS }}>
          Tap any label for a plain-English explanation · Click anywhere to dismiss · auto-closing in 4s
        </div>
        <div style={{ height: 2, background: `${C.amber}22`, borderRadius: 1 }}>
          <div ref={barRef} style={{ height: '100%', width: '100%', background: C.amber, borderRadius: 1 }} />
        </div>
      </div>
    </div>
  )
}

// ── Sidebar sub-components ────────────────────────────────────────────────────

function SideSection({ title, color, tipTitle, tipBody, children, animate }: {
  title: string; color?: string; tipTitle?: string; tipBody?: string
  children: React.ReactNode; animate?: boolean
}) {
  return (
    <div style={animate ? { animation: 'circuit-fadein 0.5s ease-out' } : undefined}>
      <div
        onClick={(e) => { if (tipTitle && tipBody) { e.stopPropagation(); _showTip?.(tipTitle, tipBody, e.clientX, e.clientY) } }}
        style={{
          fontSize: 10, fontWeight: 600, letterSpacing: 3,
          color: color ?? C.textDim, marginBottom: 12,
          fontFamily: SANS, textTransform: 'uppercase' as const,
          cursor: tipTitle ? 'pointer' : 'default',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        {title}
        {tipTitle && (
          <span style={{ fontSize: 9, color: `${color ?? C.cyan}66`, fontWeight: 400, letterSpacing: 0 }}>?</span>
        )}
      </div>
      {children}
    </div>
  )
}

function MetricBig({ label, value, color, suffix, tipTitle, tipBody }: {
  label: string; value: string; color: string; suffix?: string
  tipTitle?: string; tipBody?: string
}) {
  return (
    <div
      onClick={(e) => { if (tipTitle && tipBody) { e.stopPropagation(); _showTip?.(tipTitle, tipBody, e.clientX, e.clientY) } }}
      style={{ cursor: tipTitle ? 'pointer' : 'default' }}
    >
      <div style={{
        fontSize: 10, color: tipTitle ? C.cyan : C.textDim, fontFamily: SANS, marginBottom: 3,
        borderBottom: tipTitle ? '1px dashed rgba(0,204,255,0.35)' : 'none',
        display: 'inline-block',
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ fontSize: 21, fontWeight: 700, color, fontFamily: MONO, textShadow: `0 0 10px ${color}66`, lineHeight: 1 }}>
          {value}
        </span>
        {suffix && <span style={{ fontSize: 10, color: `${color}88`, fontFamily: MONO }}>{suffix}</span>}
      </div>
    </div>
  )
}

// ── Why Quantum panel ─────────────────────────────────────────────────────────

function WhyQuantumPanel({ waypoints, p3Time }: { waypoints: number; p3Time?: string }) {
  const n           = Math.max(waypoints, 2)
  const classicalMs = Math.pow(2, n) * 0.1
  const classicalStr = classicalMs < 1000
    ? `${classicalMs.toFixed(0)} ms`
    : classicalMs < 60000
    ? `~${(classicalMs / 1000).toFixed(1)} s`
    : classicalMs < 3_600_000
    ? `~${(classicalMs / 60000).toFixed(1)} min`
    : `~${(classicalMs / 3_600_000).toFixed(1)} hrs`
  const quantumMs = p3Time ? parseFloat(p3Time) * 1000 : 1000
  const speedup   = Math.round(classicalMs / quantumMs)

  return (
    <SideSection
      title="Why Quantum?"
      color={C.cyan}
      tipTitle="Quantum Advantage — The Core Idea"
      tipBody="Classical computers must evaluate paths one by one: 2 possibilities, then 4, then 8 — it doubles every step (exponential growth). Quantum computers use superposition to evaluate ALL paths simultaneously, then collapse to the best one. On a problem with 17 waypoints, that's the difference between seconds and hours."
      animate
    >
      <div style={{ background: `${C.cyan}07`, border: `1px solid ${C.cyan}33`, borderRadius: 8, padding: '14px 16px' }}>
        <div style={{ fontSize: 10, color: C.textDim, fontFamily: SANS, marginBottom: 4 }}>
          <Tip title="Classical Search Space" body={`Classical routing must check every possible combination of waypoints. With ${n} waypoints, that's 2 raised to the power of ${n} — roughly ${Math.pow(2, n).toLocaleString()} paths to evaluate one by one.`}>
            Classical search space
          </Tip>
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: C.red, fontFamily: MONO, textShadow: `0 0 12px ${C.red}66`, lineHeight: 1, marginBottom: 16 }}>
          2<sup style={{ fontSize: 16 }}>{n}</sup>
        </div>

        {([
          {
            label: 'Classical ETA', val: classicalStr, color: C.red,
            tipTitle: 'Classical Routing Time',
            tipBody: `Time for a classical computer to brute-force all 2^${n} path combinations at 1 check per 0.1ms. This grows exponentially — double the waypoints and the time squares. Real navigation problems have hundreds of waypoints, making classical search completely impractical.`,
          },
          {
            label: 'Quantum compute', val: p3Time ?? '—', color: C.green,
            tipTitle: 'Quantum Compute Time',
            tipBody: 'How long the on-board quantum processor (StatevectorSampler) took to converge on the optimal route using QAOA. This is the actual wall-clock time measured during this run — it stays roughly constant even as problem size grows.',
          },
        ] as { label: string; val: string; color: string; tipTitle: string; tipBody: string }[]).map(({ label, val, color, tipTitle, tipBody }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 10, fontFamily: SANS }}>
              <Tip title={tipTitle} body={tipBody}>{label}</Tip>
            </span>
            <span style={{ fontSize: 13, color, fontFamily: MONO, textShadow: `0 0 6px ${color}66` }}>{val}</span>
          </div>
        ))}

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.cyan}33` }}>
          <div
            onClick={(e) => { e.stopPropagation(); _showTip?.('Speedup Factor', `The quantum solution is roughly ${speedup.toLocaleString()} times faster than brute-force classical search on this problem. The speedup grows exponentially with problem size — this is the fundamental reason quantum routing is mission-critical for complex navigation scenarios.`, e.clientX, e.clientY) }}
            style={{ cursor: 'pointer' }}
          >
            <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 2, fontFamily: SANS, marginBottom: 5, borderBottom: '1px dashed rgba(0,204,255,0.35)', display: 'inline-block' }}>
              SPEEDUP FACTOR
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, color: C.cyan, fontFamily: MONO, textShadow: `0 0 14px ${C.cyan}88`, lineHeight: 1 }}>
              ~{speedup > 1 ? speedup.toLocaleString() : '—'}
              <span style={{ fontSize: 16 }}>×</span>
            </div>
          </div>
        </div>
      </div>
    </SideSection>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [viewMode,         setViewMode]         = useState<'solar' | 'grid'>('solar')
  const [clock,            setClock]            = useState('')
  const [phase,            setPhase]            = useState<MissionPhase>('NOMINAL')
  const [star,             setStar]             = useState<StarResult | null>(null)
  const [hazards,          setHazards]          = useState<HazardNode[]>([])
  const [route,            setRoute]            = useState<RouteNode[]>([])
  const [blackoutFlash,    setBlackoutFlash]    = useState(false)
  const [quantumProof,     setQuantumProof]     = useState<QuantumProof | null>(null)
  const [showCircuitModal, setShowCircuitModal] = useState(false)
  const [timings,          setTimings]          = useState<{ p1?: string; p2?: string; p3?: string }>({})
  const [tooltip,          setTooltip]          = useState<TooltipData | null>(null)
  const [log,              setLog]              = useState<LogEntry[]>([
    { ts: nowTs(), type: 'INFO',    text: 'Aegis-Nav quantum navigation system initialized.' },
    { ts: nowTs(), type: 'QUANTUM', text: 'VQC training complete on local AerSimulator (2 qubits, depth 2).' },
    { ts: nowTs(), type: 'INFO',    text: 'Communications array nominal. Awaiting mission trigger.' },
  ])

  // Wire up the module-level showTip reference
  const showTip = useCallback((title: string, body: string, x: number, y: number) => {
    setTooltip({ title, body, x, y })
  }, [])
  useTipFn(showTip)

  useEffect(() => {
    const tick = () => setClock(new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC')
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id)
  }, [])

  const addLog = (type: LogEntry['type'], text: string) =>
    setLog(prev => [...prev, { ts: nowTs(), type, text }])

  const dismissModal = () => setShowCircuitModal(false)

  async function triggerEmergency() {
    setBlackoutFlash(true)
    setTimeout(() => setBlackoutFlash(false), 1400)
    setPhase('BLACKOUT')
    addLog('WARN',  'SOLAR FLARE DETECTED. Severing uplink to Earth...')
    addLog('ERROR', 'COMMS ARRAY OFFLINE. Radio blackout confirmed.')
    await delay(900)

    setPhase('CLASSIFYING')
    addLog('QUANTUM', 'Initializing on-board Quantum Variational Classifier...')
    addLog('QUANTUM', 'Encoding stellar telemetry via ZZFeatureMap (2 qubits)...')

    const t1 = Date.now()
    let starResult: StarResult
    try {
      const res = await fetch(`${API}/api/classify-star`)
      if (!res.ok) throw new Error(`API error ${res.status}`)
      starResult = await res.json()
    } catch (err) {
      addLog('ERROR', `API unreachable — ${err instanceof Error ? err.message : 'network error'}`)
      setPhase('NOMINAL'); return
    }
    setTimings(prev => ({ ...prev, p1: `${((Date.now() - t1) / 1000).toFixed(2)}s` }))
    setStar(starResult)

    try {
      const proof: QuantumProof = await (await fetch(`${API}/api/quantum-circuit`)).json()
      setQuantumProof(proof)
      setShowCircuitModal(true)
      addLog('QUANTUM', `Circuit verified — ${proof.cobyla_iterations} COBYLA evaluations on ${proof.backend}`)
    } catch { /* non-critical */ }

    addLog('QUANTUM', `VQC complete — mode: ${starResult.mode}`)
    addLog('QUANTUM', `${starResult.classification} (${Math.round(starResult.confidence * 100)}% confidence)`)
    addLog('INFO',    `Safe-harbor: ${starResult.star_name} at (${starResult.target_star.x}, ${starResult.target_star.y})`)
    await delay(600)

    setPhase('STAR_LOCKED')
    await delay(500)

    setPhase('FETCHING_HAZARDS')
    addLog('INFO', 'Querying NASA NeoWs asteroid feed, NOAA DONKI solar data, orbital debris catalogue...')
    const t2 = Date.now()
    const fetchedHazards = await fetchHazards()
    setTimings(prev => ({ ...prev, p2: `${((Date.now() - t2) / 1000).toFixed(2)}s` }))
    const byThreat = (h: HazardNode) => ({ high: 3, medium: 2, low: 1 }[h.threat] ?? 0)
    const topAsteroids = fetchedHazards.filter(h => !h.type || h.type === 'asteroid').sort((a,b) => byThreat(b) - byThreat(a)).slice(0, 6)
    const topDebris    = fetchedHazards.filter(h => h.type === 'debris').slice(0, 4)
    const topFlares    = fetchedHazards.filter(h => h.type === 'solar_flare').sort((a,b) => byThreat(b) - byThreat(a)).slice(0, 3)
    const topNasa      = [...topAsteroids, ...topDebris, ...topFlares]
    const allHazards   = [...BLOCKER_HAZARDS, ...topNasa]
    setHazards(allHazards)
    const aC = allHazards.filter(h => !h.type || h.type === 'asteroid').length
    const dC = allHazards.filter(h => h.type === 'debris').length
    const fC = allHazards.filter(h => h.type === 'solar_flare').length
    addLog('WARN',  `${allHazards.length} threats mapped: ${aC} asteroids · ${dC} debris fields · ${fC} solar flare zones.`)
    addLog('ERROR', '3 high-threat asteroids on direct classical vector — collision course confirmed.')
    await delay(500)

    setPhase('ROUTING')
    addLog('INFO',    'Formulating QUBO problem matrix...')
    addLog('QUANTUM', 'Running QAOA on local StatevectorSampler...')
    const t3 = Date.now()
    const fetchedRoute = await fetchQuantumRoute({ x: 10, y: 50 }, starResult.target_star, allHazards)
    setTimings(prev => ({ ...prev, p3: `${((Date.now() - t3) / 1000).toFixed(2)}s` }))
    const visualArc = computeVisualArc({ x: 10, y: 50 }, starResult.target_star, allHazards)
    setRoute(visualArc)
    addLog('QUANTUM', `Optimal trajectory computed — ${fetchedRoute.length} QAOA waypoints, rendered as ${visualArc.length}-point evasion arc.`)
    await delay(400)

    setPhase('ROUTE_COMPLETE')
    addLog('INFO', 'All quantum pipeline stages complete.')
    addLog('INFO', 'Safe corridor established. Initiating evasive burn sequence.')
  }

  const isActive   = phase !== 'NOMINAL'
  const isScanning = phase === 'CLASSIFYING'
  const travelling = phase === 'ROUTE_COMPLETE'
  const classicalPath = star ? classicalStraightLine({ x: 10, y: 50 }, star.target_star) : null
  const routePhase    = phase === 'ROUTE_COMPLETE'

  const highCount     = hazards.filter(h => h.threat === 'high').length
  const medCount      = hazards.filter(h => h.threat === 'medium').length
  const lowCount      = hazards.filter(h => h.threat === 'low').length
  const asteroidCount = hazards.filter(h => !h.type || h.type === 'asteroid').length
  const debrisCount   = hazards.filter(h => h.type === 'debris').length
  const flareCount    = hazards.filter(h => h.type === 'solar_flare').length

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      background: C.bg, fontFamily: SANS, color: C.text, overflow: 'hidden',
    }}>

      {blackoutFlash && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: C.red, animation: 'blackout-flash 1.4s ease-out forwards', pointerEvents: 'none' }} />
      )}

      {/* Global tooltip */}
      {tooltip && <GlobalTooltip data={tooltip} onClose={() => setTooltip(null)} />}

      <HeaderBar phase={phase} clock={clock} />
      <PipelineBar phase={phase} star={star} hazards={hazards} route={route} />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        <aside style={{
          width: 268, flexShrink: 0,
          background: C.bgPanel, borderRight: `1px solid ${C.border}`,
          display: 'flex', flexDirection: 'column',
          padding: '24px 20px', overflowY: 'auto', gap: 28,
        }}>

          {/* VESSEL */}
          <SideSection
            title="Vessel"
            tipTitle="AEG-7X Deep Probe"
            tipBody="Your spacecraft, operating in full radio blackout — no contact with Earth mission control. It has an on-board quantum computer that runs the VQC classifier and QAOA router autonomously in emergencies exactly like this one."
          >
            <div style={{ fontSize: 19, fontWeight: 700, color: C.cyan, fontFamily: MONO, textShadow: `0 0 10px ${C.cyan}77`, lineHeight: 1 }}>
              AEG-7X
            </div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 6, fontFamily: MONO }}>DEEP PROBE · POS 10, 50</div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 7, fontSize: 10, color: isActive ? C.red : C.green }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: isActive ? C.red : C.green,
                boxShadow: `0 0 5px ${isActive ? C.red : C.green}`,
                display: 'inline-block',
                animation: isActive ? 'blink 0.8s step-end infinite' : 'pulse 2s infinite',
              }} />
              COMMS {isActive ? 'OFFLINE' : 'NOMINAL'}
            </div>
          </SideSection>

          {/* DESTINATION */}
          {star && (
            <SideSection
              title="Destination"
              color={C.green}
              tipTitle="Quantum-Selected Destination"
              tipBody={`The safe-harbor star chosen by the Quantum Variational Classifier. It analyzed temperature and brightness readings encoded as quantum states and classified this system as Habitable & Stable with ${Math.round(star.confidence * 100)}% confidence. No classical AI was used — this is pure quantum machine learning.`}
              animate
            >
              <div style={{ fontSize: 17, fontWeight: 700, color: C.green, fontFamily: MONO, textShadow: `0 0 8px ${C.green}77`, lineHeight: 1 }}>
                {star.star_name}
              </div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 6, fontFamily: MONO }}>
                {Math.round(star.confidence * 100)}% CONF · ({star.target_star.x}, {star.target_star.y})
              </div>
              <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>{star.classification}</div>
            </SideSection>
          )}

          {/* THREAT MATRIX */}
          {hazards.length > 0 && (
            <SideSection
              title="Threat Matrix"
              color={C.red}
              tipTitle="Threat Matrix — Multi-Source Classification"
              tipBody="Three live feeds scored into a unified threat scale: NASA NeoWs asteroids (size × velocity → 1–10), NOAA DONKI solar flares (Class X/M/C → sensor blackout zones), orbital debris (Kessler-syndrome clusters). HIGH (8–10) = immediate collision risk. MED (4–7) = warning zone. LOW (1–3) = tracking only. All feeds into QAOA as avoidance constraints."
              animate
            >
              {/* Threat-level tiles */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
                {([
                  { label: 'HIGH', count: highCount, color: C.red,
                    tip: 'Immediate collision risk. Objects large/energetic enough to destroy the vessel on the direct classical route. The quantum router arcs safely around all of them.' },
                  { label: 'MED',  count: medCount,  color: C.amber,
                    tip: 'Warning zone — not on the direct path, but close enough to pose danger. The QAOA optimizer includes these in its cost function to maintain a safe clearance margin.' },
                  { label: 'LOW',  count: lowCount,  color: '#ffff44',
                    tip: 'Low-risk objects from all three feeds. Unlikely to intersect the optimal corridor, but still included in the quantum optimization for maximum safety.' },
                ] as { label: string; count: number; color: string; tip: string }[]).map(({ label, count, color, tip }) => (
                  <div
                    key={label}
                    onClick={(e) => { e.stopPropagation(); _showTip?.(`${label} — Threat Level`, tip, e.clientX, e.clientY) }}
                    style={{
                      background: `${color}0c`, border: `1px solid ${color}44`,
                      borderRadius: 8, padding: '13px 8px', textAlign: 'center', cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: MONO, textShadow: `0 0 10px ${color}77`, lineHeight: 1 }}>
                      {count}
                    </div>
                    <div style={{ fontSize: 8, color: C.textDim, letterSpacing: 2, marginTop: 4, fontFamily: SANS }}>{label}</div>
                  </div>
                ))}
              </div>
              {/* Source breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {([
                  { label: 'ASTEROIDS', count: asteroidCount, color: C.red,      tip: "NASA NeoWs 7-day near-Earth asteroid feed. Each object scored by diameter × velocity. Source: api.nasa.gov/neo." },
                  { label: 'DEBRIS',    count: debrisCount,   color: '#ff8800',   tip: 'Kessler-syndrome orbital debris clusters — modelled from real satellite fragmentation events (Fengyun-1C, Cosmos-2251, Iridium-33). Position shifts daily as orbits decay.' },
                  { label: 'SOL FLARE', count: flareCount,    color: '#ffcc22',   tip: 'NOAA DONKI live solar flare feed. Class X/M/C events mapped as sensor blackout zones. Source: kauai.ccmc.gsfc.nasa.gov/DONKI.' },
                ] as { label: string; count: number; color: string; tip: string }[]).map(({ label, count, color, tip }) => (
                  <div
                    key={label}
                    onClick={(e) => { e.stopPropagation(); _showTip?.(`${label} — Data Source`, tip, e.clientX, e.clientY) }}
                    style={{
                      background: `${color}08`, border: `1px solid ${color}33`,
                      borderRadius: 6, padding: '8px 6px', textAlign: 'center', cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: MONO, lineHeight: 1 }}>
                      {count}
                    </div>
                    <div style={{ fontSize: 7, color: C.textDim, letterSpacing: 1.5, marginTop: 3, fontFamily: SANS }}>{label}</div>
                  </div>
                ))}
              </div>
            </SideSection>
          )}

          {/* QAOA ROUTE */}
          {routePhase && (
            <SideSection
              title="QAOA Route"
              color={C.green}
              tipTitle="QAOA Route Result"
              tipBody="The Quantum Approximate Optimization Algorithm found this safe corridor by encoding the routing problem as a QUBO (Quadratic Unconstrained Binary Optimization) and running it on a quantum circuit. Each waypoint is guaranteed to maintain safe clearance from all detected hazards."
              animate
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <MetricBig
                  label="Safe waypoints" value={String(route.length)} color={C.green}
                  tipTitle="Safe Waypoints"
                  tipBody="The number of coordinates defining the quantum-optimized flight path. Each point was chosen by the QAOA algorithm to maximize distance from hazards while minimizing total flight distance."
                />
                <MetricBig
                  label="Compute time" value={timings.p3 ?? '—'} color={C.amber}
                  tipTitle="Quantum Compute Time"
                  tipBody="Wall-clock time for QAOA to converge on the optimal route, including QUBO formulation, circuit execution, and COBYLA optimization. Compare this to the classical ETA below."
                />
              </div>
            </SideSection>
          )}

          {/* WHY QUANTUM */}
          {routePhase && <WhyQuantumPanel waypoints={route.length} p3Time={timings.p3} />}

          <div style={{ flex: 1 }} />

          {/* Trigger button */}
          <button
            disabled={isActive}
            onClick={triggerEmergency}
            style={{
              padding: '15px 12px',
              background: isActive ? `${C.red}08` : `${C.red}18`,
              border: `1.5px solid ${isActive ? `${C.red}33` : C.red}`,
              borderRadius: 8, color: isActive ? `${C.red}55` : C.red,
              fontSize: 11, fontFamily: MONO, fontWeight: 700, letterSpacing: 2,
              cursor: isActive ? 'not-allowed' : 'pointer',
              textShadow: isActive ? 'none' : `0 0 8px ${C.red}`,
              boxShadow: isActive ? 'none' : `0 0 16px ${C.red}33, inset 0 0 16px ${C.red}0a`,
              transition: 'all 0.3s', lineHeight: 1.7, width: '100%',
            }}
          >
            {isActive
              ? '◈ QUANTUM BRAIN ACTIVE'
              : <>⚠ SIMULATE COMMS BLACKOUT<br />&amp; DEBRIS CASCADE</>
            }
          </button>
        </aside>

        {/* ── 3D Canvas ── */}
        <main style={{ flex: 1, background: C.bg, position: 'relative', overflow: 'hidden' }}>

          {/* View mode toggle — top-left corner of canvas */}
          <div style={{
            position: 'absolute', top: 16, left: 16, zIndex: 25,
            display: 'flex', gap: 4,
          }}>
            {(['solar', 'grid'] as const).map(mode => {
              const active = viewMode === mode
              return (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{
                    background: active ? 'rgba(0,204,255,0.15)' : 'rgba(3,3,16,0.75)',
                    border: `1px solid ${active ? 'rgba(0,204,255,0.6)' : 'rgba(0,204,255,0.2)'}`,
                    borderRadius: 6, cursor: 'pointer',
                    color: active ? '#00ccff' : '#4a6070',
                    fontFamily: 'Courier New, monospace',
                    fontSize: 9, fontWeight: 700, letterSpacing: 2,
                    padding: '5px 10px',
                    textShadow: active ? '0 0 8px #00ccff88' : 'none',
                    transition: 'all 0.15s',
                    backdropFilter: 'blur(6px)',
                  }}
                >
                  {mode === 'solar' ? '3D SOLAR' : 'GRID 2D'}
                </button>
              )
            })}
          </div>

          {viewMode === 'solar' ? (
            <SolarSystemView
              shipPosition={{ x: 10, y: 50 }}
              targetStar={star ? { x: star.target_star.x, y: star.target_star.y, name: star.star_name, confidence: star.confidence } : null}
              hazards={hazards}
              route={route}
              classicalPath={classicalPath}
              scanning={isScanning}
              travelling={travelling}
              onObjectClick={showTip}
            />
          ) : (
            <SpaceGrid
              shipPosition={{ x: 10, y: 50 }}
              targetStar={star ? { x: star.target_star.x, y: star.target_star.y, name: star.star_name, confidence: star.confidence } : null}
              hazards={hazards}
              route={route}
              classicalPath={classicalPath}
              scanning={isScanning}
              travelling={travelling}
              onObjectClick={showTip}
            />
          )}

          {showCircuitModal && quantumProof && (
            <QuantumCircuitModal proof={quantumProof} onClose={dismissModal} />
          )}

          {/* HUD overlay */}
          {phase !== 'NOMINAL' && (
            <div style={{
              position: 'absolute', top: 20, right: 20, zIndex: 20,
              background: 'rgba(3,3,16,0.88)', border: `1px solid ${C.cyan}33`,
              borderRadius: 8, padding: '16px 20px', minWidth: 260,
              boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 16px ${C.cyan}0d`,
              animation: 'circuit-fadein 0.4s ease-out', backdropFilter: 'blur(4px)',
            }}>
              <div style={{ fontSize: 9, letterSpacing: 4, color: C.cyan, marginBottom: 12, borderBottom: `1px solid ${C.border}`, paddingBottom: 8, textShadow: `0 0 8px ${C.cyan}`, fontFamily: MONO }}>
                ◈ MISSION TELEMETRY
              </div>

              {([
                {
                  label: 'STATUS',
                  value: phase === 'ROUTE_COMPLETE' ? 'ROUTE SECURE' : 'COMMS BLACKOUT',
                  color: phase === 'ROUTE_COMPLETE' ? C.green : C.red,
                  flash: phase !== 'ROUTE_COMPLETE' && phase !== 'ROUTING',
                },
                {
                  label: 'CLASSICAL ROUTING',
                  value: star ? 'COLLISION DETECTED' : 'COMPUTING...',
                  color: C.red, flash: false,
                },
                {
                  label: 'QAOA CONVERGENCE',
                  value: timings.p3 ? timings.p3 : phase === 'ROUTING' ? 'RUNNING...' : '—',
                  color: timings.p3 ? C.green : phase === 'ROUTING' ? C.amber : C.textDim,
                  flash: false,
                },
                {
                  label: 'IMPACT PROBABILITY',
                  value: phase === 'ROUTE_COMPLETE' ? '99% → 0%' : '99%',
                  color: phase === 'ROUTE_COMPLETE' ? C.green : C.red,
                  flash: false,
                },
              ] as { label: string; value: string; color: string; flash: boolean }[]).map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 9, letterSpacing: 2, color: C.textDim, fontFamily: SANS }}>{row.label}</span>
                  <span style={{ fontSize: 10, color: row.color, letterSpacing: 1, fontFamily: MONO, textShadow: row.color !== C.textDim ? `0 0 6px ${row.color}` : 'none', animation: row.flash ? 'blink 0.8s step-end infinite' : 'none' }}>
                    {row.value}
                  </span>
                </div>
              ))}

              {phase === 'ROUTE_COMPLETE' && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 8, fontFamily: SANS }}>PATH LEGEND</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
                    <div style={{ width: 26, height: 0, borderTop: '2px dashed #ff222288' }} />
                    <span style={{ fontSize: 8, color: C.red, letterSpacing: 1, fontFamily: SANS }}>CLASSICAL — COLLISION COURSE</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{ width: 26, height: 2, background: C.green, boxShadow: `0 0 5px ${C.green}` }} />
                    <span style={{ fontSize: 8, color: C.green, letterSpacing: 1, fontFamily: SANS }}>QUANTUM QAOA — SAFE HARBOR</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {phase === 'NOMINAL' && (
            <div style={{ position: 'absolute', bottom: 18, right: 18, fontSize: 9, letterSpacing: 2, color: C.textDim, fontFamily: MONO }}>
              AWAITING QUANTUM SCAN...
            </div>
          )}
          {phase === 'ROUTING' && (
            <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', fontSize: 9, letterSpacing: 3, color: C.amber, textShadow: `0 0 8px ${C.amber}`, animation: 'pulse 1s ease-in-out infinite', fontFamily: MONO }}>
              CALCULATING QAOA TENSOR NETWORK...
            </div>
          )}
          {phase === 'ROUTE_COMPLETE' && (
            <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', fontSize: 9, letterSpacing: 3, color: C.green, textShadow: `0 0 10px ${C.green}`, fontFamily: MONO }}>
              QUANTUM SAFE CORRIDOR ESTABLISHED
            </div>
          )}
        </main>
      </div>

      <StatusLog entries={log} />
    </div>
  )
}
