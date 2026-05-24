import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars, Line, Html } from '@react-three/drei'
import { useRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HazardNode {
  x: number
  y: number
  threat: 'high' | 'medium' | 'low'
  label?: string
  type?: 'asteroid' | 'debris' | 'solar_flare'
}

export interface RouteNode {
  x: number
  y: number
}

export type OnObjectClick = (title: string, body: string, x: number, y: number) => void

export interface SpaceGridProps {
  shipPosition:  { x: number; y: number }
  targetStar:    { x: number; y: number; name?: string; confidence?: number } | null
  hazards:       HazardNode[]
  route:         RouteNode[]
  classicalPath: RouteNode[] | null
  scanning?:     boolean
  travelling?:   boolean
  onObjectClick?: OnObjectClick
}

// Grid coord (0-100) → centred 3D world space
const to3D = (gx: number, gy: number, elev = 0): [number, number, number] =>
  [gx - 50, elev, 50 - gy]

type HazardType = 'asteroid' | 'debris' | 'solar_flare'

const HAZARD_TIPS: Record<HazardType, Record<HazardNode['threat'], string>> = {
  asteroid: {
    high:   'High-risk asteroid on the direct classical flight corridor. Size × velocity puts it at the top of the NASA NeoWs threat scale. Classical navigation flies straight into it — the quantum route arcs safely around it.',
    medium: 'Medium-risk asteroid in the warning zone. Not on the direct path, but close enough to matter. The QAOA optimizer routes around it to maintain a guaranteed clearance margin.',
    low:    "Low-risk asteroid from NASA's 7-day NEO feed. Unlikely to intersect the corridor, but still included in the quantum optimization for maximum safety margin.",
  },
  debris: {
    high:   'High-density orbital debris cluster — remnants of a fragmented satellite in low orbit. Thousands of fragments at ~28,000 km/h. Even a paint-chip sized shard can breach a hull at this velocity.',
    medium: 'Medium-density debris field from a defunct satellite. Position shifts daily as atmospheric drag decays the orbit — the cluster is recalculated each run.',
    low:    'Low-density debris shard from historical collision cascades (Kessler syndrome). Small individual threat, but part of an expanding debris belt that makes orbital paths increasingly hazardous.',
  },
  solar_flare: {
    high:   'Class-X solar flare — extreme ultraviolet and X-ray burst. Creates a hard sensor blackout zone: navigation instruments go blind, comms are jammed, and unshielded crew faces lethal radiation. The quantum router treats this as an impassable region.',
    medium: 'Class-M solar flare — significant radiation storm from NOAA DONKI live feed. Disrupts GPS signals, scrambles onboard sensors, and degrades thrust control authority. QAOA routes around the interference zone.',
    low:    'Class-C solar flare — minor radiation event. Low immediate danger but causes signal degradation and elevated SEU (single-event upset) rates in electronics. Included in the quantum cost function as a soft avoidance zone.',
  },
}

// ── Grid floor ────────────────────────────────────────────────────────────────

function GridFloor() {
  const grid = useMemo(() => {
    const g = new THREE.GridHelper(
      100, 20,
      new THREE.Color(0x00ccff).multiplyScalar(0.4),
      new THREE.Color(0x00ccff).multiplyScalar(0.12),
    )
    const mats = Array.isArray(g.material) ? g.material : [g.material]
    mats.forEach(m => { m.transparent = true; m.opacity = 0.7 })
    return g
  }, [])
  return <primitive object={grid} position={[0, 0, 0]} />
}

// ── Ship ──────────────────────────────────────────────────────────────────────

function ShipMesh({ initialPos, routePoints, travelling, onObjectClick }: {
  initialPos:    [number, number, number]
  routePoints:   [number, number, number][]
  travelling:    boolean
  onObjectClick?: OnObjectClick
}) {
  const groupRef      = useRef<THREE.Group>(null)
  const lightRef      = useRef<THREE.PointLight>(null)
  const posRef        = useRef(new THREE.Vector3(...initialPos))
  const wpIndexRef    = useRef(0)
  const prevTravRef   = useRef(false)

  useEffect(() => {
    if (travelling && !prevTravRef.current) {
      posRef.current.set(...initialPos)
      wpIndexRef.current = 0
    }
    prevTravRef.current = travelling
  })

  useFrame(({ clock }, delta) => {
    if (lightRef.current)
      lightRef.current.intensity = 1.8 + Math.sin(clock.elapsedTime * 6) * 0.5

    if (!travelling || routePoints.length === 0 || !groupRef.current) return

    const target = routePoints[wpIndexRef.current]
    if (!target) return
    const targetVec = new THREE.Vector3(...target)

    const SPEED = 20
    const dir   = targetVec.clone().sub(posRef.current)
    const dist  = dir.length()
    if (dist > 0.05) {
      posRef.current.addScaledVector(dir.normalize(), Math.min(SPEED * delta, dist))
    } else {
      posRef.current.copy(targetVec)
      wpIndexRef.current = Math.min(wpIndexRef.current + 1, routePoints.length - 1)
    }
    groupRef.current.position.copy(posRef.current)

    if (dist > 0.5) {
      const angle = Math.atan2(dir.x, dir.z)
      groupRef.current.rotation.y = angle
    }
  })

  return (
    <group ref={groupRef} position={initialPos}>
      <pointLight ref={lightRef} color="#00ccff" intensity={2} distance={28} />
      <mesh
        rotation={[0, Math.PI / 4, Math.PI / 2]}
        onClick={(e) => {
          e.stopPropagation()
          onObjectClick?.(
            'AEG-7X — YOUR VESSEL',
            'Deep-space emergency probe, operating in full radio blackout — no contact with Earth mission control. All navigation is handled autonomously by the on-board quantum computer, which just computed the safe corridor using QAOA.',
            e.nativeEvent.clientX,
            e.nativeEvent.clientY,
          )
        }}
      >
        <coneGeometry args={[2, 9, 4]} />
        <meshStandardMaterial color="#00ccff" emissive="#00ccff" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[-5, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[1.4, 1.4, 0.6, 16]} />
        <meshStandardMaterial color="#00ccff" emissive="#00ccff" emissiveIntensity={3} transparent opacity={0.6} />
      </mesh>
      <Html center position={[0, 7, 0]} zIndexRange={[15, 0]} style={{
        color: '#00ccff', fontSize: 10, letterSpacing: 2,
        whiteSpace: 'nowrap', textShadow: '0 0 8px #00ccff',
        pointerEvents: 'none', fontFamily: 'Courier New, monospace',
      }}>
        ◈ AEG-7X
      </Html>
    </group>
  )
}

// ── Target star ───────────────────────────────────────────────────────────────

function TargetStarMesh({ pos, name, confidence, onObjectClick }: {
  pos:            [number, number, number]
  name?:          string
  confidence?:    number
  onObjectClick?: OnObjectClick
}) {
  const haloRef = useRef<THREE.Mesh>(null)
  const coreRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (haloRef.current) {
      haloRef.current.scale.setScalar(1 + Math.sin(t * 1.4) * 0.3)
      ;(haloRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.10 + Math.sin(t * 1.4) * 0.07
    }
    if (coreRef.current)
      coreRef.current.scale.setScalar(1 + Math.sin(t * 2.2) * 0.1)
  })

  const handleClick = (e: { stopPropagation: () => void; nativeEvent: MouseEvent }) => {
    e.stopPropagation()
    const confStr = confidence ? ` with ${Math.round(confidence * 100)}% confidence` : ''
    onObjectClick?.(
      name ?? 'TARGET STAR',
      `Safe-harbor destination selected by the on-board Quantum Variational Classifier${confStr}. Temperature and brightness were encoded as quantum states and run through an entangled 2-qubit circuit, which classified this system as Habitable & Stable. This is where the ship is heading.`,
      e.nativeEvent.clientX,
      e.nativeEvent.clientY,
    )
  }

  return (
    <group position={pos}>
      <pointLight color="#00ff88" intensity={4} distance={50} />
      <mesh ref={coreRef} onClick={handleClick}>
        <sphereGeometry args={[2.5, 24, 24]} />
        <meshStandardMaterial color="#00ff88" emissive="#00ff88" emissiveIntensity={4} />
      </mesh>
      <mesh ref={haloRef}>
        <sphereGeometry args={[7, 20, 20]} />
        <meshBasicMaterial color="#00ff88" transparent opacity={0.10} side={THREE.BackSide} />
      </mesh>
      <Line points={[[-18, 0, 0], [18, 0, 0]]} color="#00ff88" lineWidth={0.6} transparent opacity={0.4} />
      <Line points={[[0, 0, -18], [0, 0, 18]]} color="#00ff88" lineWidth={0.6} transparent opacity={0.4} />
      <Html center position={[0, 8, 0]} zIndexRange={[15, 0]} style={{
        color: '#00ff88', fontSize: 10, letterSpacing: 2,
        whiteSpace: 'nowrap', textShadow: '0 0 10px #00ff88',
        pointerEvents: 'none', fontFamily: 'Courier New, monospace',
      }}>
        ◈ {name ?? 'TARGET'}
      </Html>
    </group>
  )
}

// ── Hazard node ───────────────────────────────────────────────────────────────

function HazardMesh({ pos, threat, label, type = 'asteroid', onObjectClick }: {
  pos:            [number, number, number]
  threat:         HazardNode['threat']
  label?:         string
  type?:          HazardNode['type']
  onObjectClick?: OnObjectClick
}) {
  const ringRef  = useRef<THREE.Mesh>(null)
  const groupRef = useRef<THREE.Group>(null)

  const isDebris = type === 'debris'
  const isFlare  = type === 'solar_flare'

  const color = isFlare  ? '#ffcc22'
              : isDebris ? '#ff8800'
              : threat === 'high' ? '#ff2222' : threat === 'medium' ? '#ffaa00' : '#ffff44'

  const radius = isFlare  ? (threat === 'high' ? 9 : threat === 'medium' ? 7 : 5)
               : threat === 'high' ? 3.8 : threat === 'medium' ? 2.8 : 1.8

  useFrame(({ clock }) => {
    // Debris: tumble the fragment group
    if (isDebris && groupRef.current) {
      groupRef.current.rotation.x = clock.elapsedTime * 0.65
      groupRef.current.rotation.y = clock.elapsedTime * 1.05
    }
    // Flare: slow breathe on the outer shell
    if (isFlare && ringRef.current) {
      const sc = 1 + Math.sin(clock.elapsedTime * 0.7 + pos[0]) * 0.12
      ringRef.current.scale.setScalar(sc)
      ;(ringRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.07 + Math.sin(clock.elapsedTime * 0.7) * 0.03
    }
    // Asteroid: original pulsing ring
    if (!isDebris && !isFlare && ringRef.current) {
      const sc = 1 + Math.sin(clock.elapsedTime * 2.5 + pos[0]) * 0.45
      ringRef.current.scale.setScalar(sc)
      ;(ringRef.current.material as THREE.MeshBasicMaterial).opacity =
        Math.max(0.04, 0.45 - (sc - 1) * 0.55)
    }
  })

  const tipBody  = (HAZARD_TIPS[type as HazardType] ?? HAZARD_TIPS.asteroid)[threat]
  const typeTag  = isFlare ? 'SOLAR FLARE' : isDebris ? 'DEBRIS FIELD' : 'ASTEROID'
  const tipTitle = label ? label : `${threat.toUpperCase()} — ${typeTag}`

  const handleClick = (e: { stopPropagation: () => void; nativeEvent: MouseEvent }) => {
    e.stopPropagation()
    onObjectClick?.(tipTitle, tipBody, e.nativeEvent.clientX, e.nativeEvent.clientY)
  }

  const labelEl = label && (
    <Html center position={[0, radius + 4, 0]} zIndexRange={[15, 0]} style={{
      color, fontSize: 8, letterSpacing: 1,
      whiteSpace: 'nowrap', pointerEvents: 'none',
      fontFamily: 'Courier New, monospace',
    }}>
      {label}
    </Html>
  )

  // ── Solar flare: large translucent sphere + bright core ──
  if (isFlare) {
    return (
      <group position={pos}>
        <pointLight color={color} intensity={0.5} distance={35} />
        {/* Outer sensor-blackout zone */}
        <mesh ref={ringRef} onClick={handleClick}>
          <sphereGeometry args={[radius, 28, 28]} />
          <meshBasicMaterial color={color} transparent opacity={0.09} side={THREE.FrontSide} />
        </mesh>
        {/* Bright corona core */}
        <mesh onClick={handleClick}>
          <sphereGeometry args={[radius * 0.22, 16, 16]} />
          <meshStandardMaterial color="#ffffff" emissive={color} emissiveIntensity={3} transparent opacity={0.9} />
        </mesh>
        {labelEl}
      </group>
    )
  }

  // ── Debris field: tumbling box fragments ──
  if (isDebris) {
    const pieces: [number, number, number][] = [
      [0, 0, 0], [1.6, 0.9, -0.6], [-1.3, 0.6, 0.9], [0.4, -1.2, 0.7], [-0.5, 1.0, -0.9],
    ]
    return (
      <group position={pos}>
        <pointLight color={color} intensity={0.7} distance={18} />
        <group ref={groupRef} onClick={handleClick}>
          {pieces.map(([dx, dy, dz], i) => (
            <mesh key={i} position={[dx, dy, dz]}>
              <boxGeometry args={[
                radius * 0.6 + (i % 3) * 0.3,
                radius * 0.4 + (i % 2) * 0.25,
                radius * 0.5 + (i % 3) * 0.2,
              ]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.3} transparent opacity={0.88} />
            </mesh>
          ))}
        </group>
        {/* Debris cloud ring */}
        <mesh ref={ringRef} rotation={[Math.PI / 4, 0, 0]}>
          <ringGeometry args={[radius + 1.0, radius + 2.2, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.22} side={THREE.DoubleSide} />
        </mesh>
        {labelEl}
      </group>
    )
  }

  // ── Asteroid: original sphere + pulsing ring ──
  return (
    <group position={pos}>
      <pointLight color={color} intensity={1.2} distance={18} />
      <mesh onClick={handleClick}>
        <sphereGeometry args={[radius, 20, 20]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.8} transparent opacity={0.9} />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius + 1.2, radius + 2.8, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>
      {labelEl}
    </group>
  )
}

// ── Scanning sweep ring ───────────────────────────────────────────────────────

function ScanRing() {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.elapsedTime * 1.3
  })
  return (
    <group ref={ref}>
      {[28, 44].map((r, i) => (
        <mesh key={i} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r, r + 1, 64]} />
          <meshBasicMaterial color="#00ccff" transparent opacity={i === 0 ? 0.3 : 0.15} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

// ── Classical (failed) straight-line path — red dashed ───────────────────────

function ClassicalPath({ points }: { points: [number, number, number][] }) {
  return (
    <>
      <Line points={points} color="#ff2222" lineWidth={6} transparent opacity={0.07} />
      <Line points={points} color="#ff2222" lineWidth={1.5} dashed dashScale={0.4} dashSize={2} gapSize={2} transparent opacity={0.75} />
    </>
  )
}

// ── QAOA quantum safe-harbor path — green solid ───────────────────────────────

function RoutePath({ points }: { points: [number, number, number][] }) {
  return (
    <>
      <Line points={points} color="#00ff88" lineWidth={10} transparent opacity={0.07} />
      <Line points={points} color="#00ff88" lineWidth={3} />
    </>
  )
}

// ── Main exported component ───────────────────────────────────────────────────

export default function SpaceGrid({
  shipPosition, targetStar, hazards, route, classicalPath,
  scanning = false, travelling = false, onObjectClick,
}: SpaceGridProps) {

  const shipPos  = useMemo(() => to3D(shipPosition.x, shipPosition.y), [shipPosition.x, shipPosition.y])
  const tgtPos   = useMemo(() => targetStar ? to3D(targetStar.x, targetStar.y) : null, [targetStar?.x, targetStar?.y])
  const routePts = useMemo(
    () => route.length >= 2 ? route.map(p => to3D(p.x, p.y)) : null,
    [route],
  )
  const classicalPts = classicalPath && classicalPath.length >= 2
    ? classicalPath.map(p => to3D(p.x, p.y))
    : null

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        camera={{ position: [0, 75, 95], fov: 55 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: '#01010a' }}
      >
        <ambientLight intensity={0.05} />
        <directionalLight position={[20, 80, 40]} intensity={0.15} color="#00ccff" />

        <Stars radius={250} depth={60} count={5000} factor={4} saturation={0} fade speed={0.4} />

        <GridFloor />

        <ShipMesh
          initialPos={shipPos}
          routePoints={routePts ?? []}
          travelling={travelling}
          onObjectClick={onObjectClick}
        />

        {tgtPos && (
          <TargetStarMesh
            pos={tgtPos}
            name={targetStar?.name}
            confidence={targetStar?.confidence}
            onObjectClick={onObjectClick}
          />
        )}

        {hazards.map((h, i) => (
          <HazardMesh
            key={i}
            pos={to3D(h.x, h.y)}
            threat={h.threat}
            label={h.label}
            type={h.type}
            onObjectClick={onObjectClick}
          />
        ))}

        {classicalPts && <ClassicalPath points={classicalPts} />}
        {routePts && <RoutePath points={routePts} />}

        {scanning && <ScanRing />}

        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          minDistance={15}
          maxDistance={220}
          zoomSpeed={0.35}
          makeDefault
        />
      </Canvas>

      {scanning && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            fontSize: 11, letterSpacing: 4, fontFamily: 'Courier New, monospace',
            color: '#00ccff', textShadow: '0 0 12px #00ccff',
            animation: 'pulse 1s ease-in-out infinite',
          }}>
            QUANTUM SCAN IN PROGRESS...
          </span>
        </div>
      )}

      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <line x1="0" y1="0" x2="28" y2="0"  stroke="#00ccff88" strokeWidth="2" />
        <line x1="0" y1="0" x2="0"  y2="28" stroke="#00ccff88" strokeWidth="2" />
        <line x1="100%" y1="0" x2="calc(100% - 28px)" y2="0"  stroke="#00ccff88" strokeWidth="2" />
        <line x1="100%" y1="0" x2="100%"              y2="28" stroke="#00ccff88" strokeWidth="2" />
        <line x1="0" y1="100%" x2="28" y2="100%"              stroke="#00ccff88" strokeWidth="2" />
        <line x1="0" y1="100%" x2="0"  y2="calc(100% - 28px)" stroke="#00ccff88" strokeWidth="2" />
        <line x1="100%" y1="100%" x2="calc(100% - 28px)" y2="100%"              stroke="#00ccff88" strokeWidth="2" />
        <line x1="100%" y1="100%" x2="100%"              y2="calc(100% - 28px)" stroke="#00ccff88" strokeWidth="2" />
      </svg>

      <div style={{
        position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
        fontSize: 9, letterSpacing: 2, color: '#2d4a5a',
        fontFamily: 'Courier New, monospace', pointerEvents: 'none',
      }}>
        DRAG TO ROTATE · SCROLL TO ZOOM · RIGHT-DRAG TO PAN · CLICK OBJECTS FOR INFO
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOLAR SYSTEM VIEW — immersive 3-D planet-to-planet travel
// ═══════════════════════════════════════════════════════════════════════════════

// ── Origin planet ─────────────────────────────────────────────────────────────

function OriginPlanet({ pos, onObjectClick }: {
  pos: [number, number, number]
  onObjectClick?: OnObjectClick
}) {
  const bodyRef = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (bodyRef.current) bodyRef.current.rotation.y = clock.elapsedTime * 0.04
  })
  const handleClick = (e: { stopPropagation: () => void; nativeEvent: MouseEvent }) => {
    e.stopPropagation()
    onObjectClick?.(
      'EARTH OUTPOST — DEPARTURE POINT',
      'Emergency departure point. Comms severed by X-class solar flare at T+00:00. The vessel launched on autonomous quantum navigation — no uplink, no mission control contact. All destination classification and routing handled entirely on-board by the quantum processor.',
      e.nativeEvent.clientX, e.nativeEvent.clientY,
    )
  }
  return (
    <group position={pos}>
      <pointLight color="#4477ff" intensity={0.8} distance={60} />
      <mesh ref={bodyRef} onClick={handleClick}>
        <sphereGeometry args={[9, 48, 48]} />
        <meshPhongMaterial color="#1a3a7a" emissive="#081428" specular="#3366cc" shininess={28} />
      </mesh>
      {/* Cloud wisp */}
      <mesh rotation={[0.25, 0.8, 0]}>
        <sphereGeometry args={[9.35, 24, 24]} />
        <meshBasicMaterial color="#ddeeff" transparent opacity={0.04} />
      </mesh>
      {/* Atmosphere */}
      <mesh>
        <sphereGeometry args={[10.4, 32, 32]} />
        <meshBasicMaterial color="#2255cc" transparent opacity={0.06} side={THREE.BackSide} />
      </mesh>
      <Html center position={[0, 14, 0]} zIndexRange={[15, 0]} style={{
        color: '#4499ff', fontSize: 9, letterSpacing: 2,
        whiteSpace: 'nowrap', pointerEvents: 'none', fontFamily: 'Courier New, monospace',
        textShadow: '0 0 8px #4499ff',
      }}>
        ◈ EARTH OUTPOST
      </Html>
    </group>
  )
}

// ── Target planet (habitable world) ──────────────────────────────────────────

function TargetPlanetMesh({ pos, name, confidence, onObjectClick }: {
  pos:            [number, number, number]
  name?:          string
  confidence?:    number
  onObjectClick?: OnObjectClick
}) {
  const bodyRef = useRef<THREE.Mesh>(null)
  const atmoRef = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (bodyRef.current) bodyRef.current.rotation.y = clock.elapsedTime * 0.06
    if (atmoRef.current) {
      atmoRef.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 1.1) * 0.16)
      ;(atmoRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.055 + Math.sin(clock.elapsedTime * 1.1) * 0.03
    }
  })
  const handleClick = (e: { stopPropagation: () => void; nativeEvent: MouseEvent }) => {
    e.stopPropagation()
    const confStr = confidence ? ` with ${Math.round(confidence * 100)}% confidence` : ''
    onObjectClick?.(
      name ?? 'TARGET SYSTEM',
      `Safe-harbor destination classified by the on-board Quantum Variational Classifier${confStr}. Temperature and brightness encoded as quantum states, run through an entangled 2-qubit circuit trained on 12 star samples. Classified as Habitable & Stable — this is the survival destination.`,
      e.nativeEvent.clientX, e.nativeEvent.clientY,
    )
  }
  return (
    <group position={pos}>
      <pointLight color="#00ff88" intensity={2.2} distance={100} />
      <mesh ref={bodyRef} onClick={handleClick}>
        <sphereGeometry args={[7, 48, 48]} />
        <meshPhongMaterial color="#1a5535" emissive="#003322" specular="#00ff88" shininess={22} />
      </mesh>
      {/* Ocean shimmer ring */}
      <mesh rotation={[0.4, 0, 0]}>
        <sphereGeometry args={[7.2, 24, 24]} />
        <meshBasicMaterial color="#004466" transparent opacity={0.05} />
      </mesh>
      {/* Atmosphere */}
      <mesh ref={atmoRef}>
        <sphereGeometry args={[9.2, 32, 32]} />
        <meshBasicMaterial color="#00ff88" transparent opacity={0.055} side={THREE.BackSide} />
      </mesh>
      <Line points={[[-30, 0, 0], [30, 0, 0]]} color="#00ff88" lineWidth={0.5} transparent opacity={0.22} />
      <Line points={[[0, 0, -30], [0, 0, 30]]} color="#00ff88" lineWidth={0.5} transparent opacity={0.22} />
      <Html center position={[0, 13, 0]} zIndexRange={[15, 0]} style={{
        color: '#00ff88', fontSize: 9, letterSpacing: 2,
        whiteSpace: 'nowrap', pointerEvents: 'none', fontFamily: 'Courier New, monospace',
        textShadow: '0 0 10px #00ff88',
      }}>
        ◈ {name ?? 'TARGET SYSTEM'}
      </Html>
    </group>
  )
}

// ── Solar System View (exported) ──────────────────────────────────────────────

export function SolarSystemView({
  shipPosition, targetStar, hazards, route, classicalPath,
  scanning = false, travelling = false, onObjectClick,
}: SpaceGridProps) {
  const shipPos  = useMemo(() => to3D(shipPosition.x, shipPosition.y), [shipPosition.x, shipPosition.y])
  const tgtPos   = useMemo(() => targetStar ? to3D(targetStar.x, targetStar.y) : null, [targetStar?.x, targetStar?.y])
  const routePts = useMemo(
    () => route.length >= 2 ? route.map(p => to3D(p.x, p.y)) : null,
    [route],
  )
  const classicalPts = classicalPath && classicalPath.length >= 2
    ? classicalPath.map(p => to3D(p.x, p.y))
    : null

  // Give each hazard a deterministic y-elevation so they float in 3-D space
  const hazardElev = (h: HazardNode, i: number) =>
    Math.sin(h.x * 0.31 + h.y * 0.53 + i * 2.71) * 14

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        camera={{ position: [0, 55, 110], fov: 52 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: '#00000a' }}
      >
        {/* Distant star (sun) */}
        <ambientLight intensity={0.07} />
        <pointLight position={[110, 75, -90]} intensity={2.8} color="#fff8e0" distance={600} />
        <directionalLight position={[50, 80, -50]} intensity={0.18} color="#aaccff" />

        {/* Dense deep-space starfield */}
        <Stars radius={380} depth={120} count={10000} factor={5} saturation={0.15} fade speed={0.2} />

        {/* Origin planet */}
        <OriginPlanet pos={shipPos} onObjectClick={onObjectClick} />

        {/* Ship launches from above the origin planet's surface */}
        <ShipMesh
          initialPos={[shipPos[0], shipPos[1] + 12, shipPos[2]]}
          routePoints={routePts ?? []}
          travelling={travelling}
          onObjectClick={onObjectClick}
        />

        {/* Target habitable planet */}
        {tgtPos && (
          <TargetPlanetMesh
            pos={tgtPos}
            name={targetStar?.name}
            confidence={targetStar?.confidence}
            onObjectClick={onObjectClick}
          />
        )}

        {/* Hazards float at varied 3-D elevations */}
        {hazards.map((h, i) => (
          <HazardMesh
            key={i}
            pos={to3D(h.x, h.y, hazardElev(h, i))}
            threat={h.threat}
            label={h.label}
            type={h.type}
            onObjectClick={onObjectClick}
          />
        ))}

        {classicalPts && <ClassicalPath points={classicalPts} />}
        {routePts && <RoutePath points={routePts} />}

        {scanning && <ScanRing />}

        <OrbitControls
          enablePan enableZoom enableRotate
          minDistance={20} maxDistance={320}
          zoomSpeed={0.35} makeDefault
        />
      </Canvas>

      {scanning && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            fontSize: 11, letterSpacing: 4, fontFamily: 'Courier New, monospace',
            color: '#00ccff', textShadow: '0 0 12px #00ccff',
            animation: 'pulse 1s ease-in-out infinite',
          }}>
            QUANTUM SCAN IN PROGRESS...
          </span>
        </div>
      )}

      {/* HUD corners */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <line x1="0" y1="0" x2="28" y2="0"  stroke="#00ccff88" strokeWidth="2" />
        <line x1="0" y1="0" x2="0"  y2="28" stroke="#00ccff88" strokeWidth="2" />
        <line x1="100%" y1="0" x2="calc(100% - 28px)" y2="0"  stroke="#00ccff88" strokeWidth="2" />
        <line x1="100%" y1="0" x2="100%"              y2="28" stroke="#00ccff88" strokeWidth="2" />
        <line x1="0" y1="100%" x2="28" y2="100%"              stroke="#00ccff88" strokeWidth="2" />
        <line x1="0" y1="100%" x2="0"  y2="calc(100% - 28px)" stroke="#00ccff88" strokeWidth="2" />
        <line x1="100%" y1="100%" x2="calc(100% - 28px)" y2="100%"              stroke="#00ccff88" strokeWidth="2" />
        <line x1="100%" y1="100%" x2="100%"              y2="calc(100% - 28px)" stroke="#00ccff88" strokeWidth="2" />
      </svg>

      <div style={{
        position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
        fontSize: 9, letterSpacing: 2, color: '#2d4a5a',
        fontFamily: 'Courier New, monospace', pointerEvents: 'none',
      }}>
        DRAG TO ROTATE · SCROLL TO ZOOM · RIGHT-DRAG TO PAN · CLICK OBJECTS FOR INFO
      </div>
    </div>
  )
}
