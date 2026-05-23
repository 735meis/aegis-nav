import { useEffect, useRef } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HazardNode {
  x: number
  y: number
  threat: 'high' | 'medium' | 'low'
  label?: string
}

export interface RouteNode {
  x: number
  y: number
}

export interface SpaceGridProps {
  shipPosition:  { x: number; y: number }
  targetStar:    { x: number; y: number; name?: string } | null
  hazards:       HazardNode[]
  route:         RouteNode[]
  /** dims the grid and shows a scanline effect while the quantum pipeline runs */
  scanning?:     boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SIZE   = 600          // SVG canvas px
const SCALE  = SIZE / 100   // 1 grid unit = 6 px

const C = {
  bg:       '#00000000',
  grid:     '#00ccff12',
  gridLine: '#00ccff08',
  cyan:     '#00ccff',
  green:    '#00ff88',
  red:      '#ff2222',
  amber:    '#ffaa00',
  textDim:  '#2d4a5a',
}

// Map grid coord (0-100) → SVG pixel
const gx = (v: number) => v * SCALE
const gy = (v: number) => (100 - v) * SCALE   // flip Y so 0 is bottom-left

// ── Component ─────────────────────────────────────────────────────────────────

export default function SpaceGrid({
  shipPosition,
  targetStar,
  hazards,
  route,
  scanning = false,
}: SpaceGridProps) {

  // Pulse animation counter for the target star ring
  const pulseRef = useRef<SVGCircleElement>(null)

  useEffect(() => {
    if (!pulseRef.current || !targetStar) return
    const el = pulseRef.current
    let r = 10, growing = true
    const id = setInterval(() => {
      r = growing ? r + 0.15 : r - 0.15
      if (r > 16) growing = false
      if (r < 10) growing = true
      el.setAttribute('r', String(r))
      el.setAttribute('opacity', String(0.7 - (r - 10) / 10))
    }, 30)
    return () => clearInterval(id)
  }, [targetStar])

  const threatColor = (t: HazardNode['threat']) =>
    t === 'high' ? C.red : t === 'medium' ? C.amber : '#ffff44'

  const threatRadius = (t: HazardNode['threat']) =>
    t === 'high' ? 8 : t === 'medium' ? 6 : 4

  // Build route polyline points string
  const routePoints = route.length >= 2
    ? [{ x: shipPosition.x, y: shipPosition.y }, ...route]
        .map(p => `${gx(p.x)},${gy(p.y)}`)
        .join(' ')
    : null

  return (
    <div style={{ position: 'relative', width: SIZE, height: SIZE }}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{
          display: 'block',
          border: `1px solid ${C.cyan}22`,
          background: '#03030a',
          opacity: scanning ? 0.6 : 1,
          transition: 'opacity 0.4s',
        }}
      >
        {/* ── Grid lines ───────────────────────────────────────────────── */}
        <defs>
          <pattern id="minorgrid" width={SCALE * 10} height={SCALE * 10} patternUnits="userSpaceOnUse">
            <path
              d={`M ${SCALE * 10} 0 L 0 0 0 ${SCALE * 10}`}
              fill="none"
              stroke={C.gridLine}
              strokeWidth="0.5"
            />
          </pattern>
          <pattern id="majorgrid" width={SCALE * 25} height={SCALE * 25} patternUnits="userSpaceOnUse">
            <rect width={SCALE * 25} height={SCALE * 25} fill="url(#minorgrid)" />
            <path
              d={`M ${SCALE * 25} 0 L 0 0 0 ${SCALE * 25}`}
              fill="none"
              stroke={C.grid}
              strokeWidth="0.8"
            />
          </pattern>
          {/* Scanline effect shown while quantum pipeline is running */}
          <pattern id="scanlines" x="0" y="0" width="2" height="4" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="2" stroke="#00ccff08" strokeWidth="1" />
          </pattern>
        </defs>

        <rect width={SIZE} height={SIZE} fill="url(#majorgrid)" />
        {scanning && <rect width={SIZE} height={SIZE} fill="url(#scanlines)" />}

        {/* ── Axis labels ───────────────────────────────────────────────── */}
        {[0, 25, 50, 75, 100].map(v => (
          <g key={v}>
            {/* X axis (bottom) */}
            <text
              x={gx(v) + 2}
              y={SIZE - 4}
              fontSize="8"
              fill={C.textDim}
              fontFamily="'Courier New', monospace"
            >{v}</text>
            {/* Y axis (left) */}
            {v > 0 && (
              <text
                x={3}
                y={gy(v) - 2}
                fontSize="8"
                fill={C.textDim}
                fontFamily="'Courier New', monospace"
              >{v}</text>
            )}
          </g>
        ))}

        {/* ── QAOA route path (teammate — renders when route is populated) ── */}
        {routePoints && (
          <polyline
            points={routePoints}
            fill="none"
            stroke={C.amber}
            strokeWidth="1.5"
            strokeDasharray="6 3"
            style={{ filter: `drop-shadow(0 0 3px ${C.amber})` }}
          />
        )}

        {/* ── Hazard nodes (teammate — renders when hazards are populated) ── */}
        {hazards.map((h, i) => {
          const color  = threatColor(h.threat)
          const radius = threatRadius(h.threat)
          return (
            <g key={i}>
              {/* Outer pulse ring */}
              <circle
                cx={gx(h.x)} cy={gy(h.y)}
                r={radius + 6}
                fill="none"
                stroke={color}
                strokeWidth="0.5"
                opacity="0.3"
              />
              {/* Main hazard dot */}
              <circle
                cx={gx(h.x)} cy={gy(h.y)}
                r={radius}
                fill={`${color}33`}
                stroke={color}
                strokeWidth="1"
                style={{ filter: `drop-shadow(0 0 4px ${color})` }}
              />
              {/* Threat label */}
              {h.label && (
                <text
                  x={gx(h.x) + radius + 3}
                  y={gy(h.y) + 3}
                  fontSize="7"
                  fill={color}
                  fontFamily="'Courier New', monospace"
                >{h.label}</text>
              )}
            </g>
          )
        })}

        {/* ── Target star (Prong 1 — renders when classify-star returns) ── */}
        {targetStar && (
          <g>
            {/* Animated pulse ring */}
            <circle
              ref={pulseRef}
              cx={gx(targetStar.x)}
              cy={gy(targetStar.y)}
              r={10}
              fill="none"
              stroke={C.green}
              strokeWidth="1"
              opacity="0.7"
            />
            {/* Cross-hair lines */}
            <line
              x1={gx(targetStar.x) - 18} y1={gy(targetStar.y)}
              x2={gx(targetStar.x) + 18} y2={gy(targetStar.y)}
              stroke={C.green} strokeWidth="0.8" opacity="0.5"
            />
            <line
              x1={gx(targetStar.x)} y1={gy(targetStar.y) - 18}
              x2={gx(targetStar.x)} y2={gy(targetStar.y) + 18}
              stroke={C.green} strokeWidth="0.8" opacity="0.5"
            />
            {/* Core dot */}
            <circle
              cx={gx(targetStar.x)}
              cy={gy(targetStar.y)}
              r={4}
              fill={C.green}
              style={{ filter: `drop-shadow(0 0 6px ${C.green})` }}
            />
            {/* Label */}
            <text
              x={gx(targetStar.x) + 10}
              y={gy(targetStar.y) - 10}
              fontSize="8"
              fill={C.green}
              fontFamily="'Courier New', monospace"
              style={{ filter: `drop-shadow(0 0 4px ${C.green})` }}
            >
              ◈ {targetStar.name ?? 'TARGET'}
            </text>
            <text
              x={gx(targetStar.x) + 10}
              y={gy(targetStar.y) - 1}
              fontSize="7"
              fill={`${C.green}99`}
              fontFamily="'Courier New', monospace"
            >
              ({targetStar.x}, {targetStar.y})
            </text>
          </g>
        )}

        {/* ── Ship marker ───────────────────────────────────────────────── */}
        <g>
          {/* Engine glow */}
          <circle
            cx={gx(shipPosition.x)}
            cy={gy(shipPosition.y)}
            r={12}
            fill={`${C.cyan}0a`}
            stroke={`${C.cyan}33`}
            strokeWidth="0.8"
          />
          {/* Ship triangle — pointing right */}
          <polygon
            points={[
              `${gx(shipPosition.x) + 10},${gy(shipPosition.y)}`,
              `${gx(shipPosition.x) - 6},${gy(shipPosition.y) - 7}`,
              `${gx(shipPosition.x) - 6},${gy(shipPosition.y) + 7}`,
            ].join(' ')}
            fill={`${C.cyan}33`}
            stroke={C.cyan}
            strokeWidth="1.5"
            strokeLinejoin="round"
            style={{ filter: `drop-shadow(0 0 5px ${C.cyan})` }}
          />
          {/* Ship label */}
          <text
            x={gx(shipPosition.x) + 14}
            y={gy(shipPosition.y) - 8}
            fontSize="8"
            fill={C.cyan}
            fontFamily="'Courier New', monospace"
          >AEG-7X</text>
          <text
            x={gx(shipPosition.x) + 14}
            y={gy(shipPosition.y) + 1}
            fontSize="7"
            fill={`${C.cyan}88`}
            fontFamily="'Courier New', monospace"
          >({shipPosition.x},{shipPosition.y})</text>
        </g>

        {/* ── Corner brackets ───────────────────────────────────────────── */}
        {(['tl','tr','bl','br'] as const).map(pos => {
          const len = 18
          const x0 = pos.includes('l') ? 0 : SIZE
          const y0 = pos.includes('t') ? 0 : SIZE
          const dx = pos.includes('l') ? len : -len
          const dy = pos.includes('t') ? len : -len
          return (
            <g key={pos} stroke={C.cyan} strokeWidth="1.5" opacity="0.6">
              <line x1={x0} y1={y0} x2={x0 + dx} y2={y0} />
              <line x1={x0} y1={y0} x2={x0}      y2={y0 + dy} />
            </g>
          )
        })}
      </svg>

      {/* Scanning overlay text */}
      {scanning && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <span style={{
            fontSize: 11, letterSpacing: 4,
            color: C.cyan, textShadow: `0 0 10px ${C.cyan}`,
          }}>
            QUANTUM SCAN IN PROGRESS...
          </span>
        </div>
      )}
    </div>
  )
}
