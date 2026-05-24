# AEGIS-NAV — Quantum Emergency Space Router

> **Hackathon 2025 · Track 3: Systems Under Pressure**
> A fully on-board quantum navigation system that operates with zero uplink, classifying safe destinations, mapping real-world threats, and computing an evasion route in seconds.

---

## What It Does

A solar flare severs the comms link. Classical navigation flies straight into an asteroid field. AEGIS-NAV's on-board quantum processor takes over:

```
PRONG 1 ─── Quantum VQC classifies the nearest habitable star   (~94% confidence)
    │
PRONG 2 ─── Three live feeds build the threat field:
    │          · NASA NeoWs  — real near-Earth asteroids (7-day window)
    │          · NOAA DONKI  — solar flare radiation zones (Class X / M / C)
    │          · Orbital debris — Kessler-syndrome clusters (shift daily)
    │
PRONG 3 ─── QAOA optimizer computes the safe corridor
               Classical brute-force: O(2ⁿ) · Quantum: converges in seconds
```

Everything runs **locally** — no cloud accounts, no external compute, no single point of failure.

---

## Live Demo

| Screen | Description |
|---|---|
| **Landing page** | `/` — animated SVG preview, scroll-reveal stats, deep-space starfield |
| **Mission control** | `/#/demo` — full pipeline UI with 3D solar system view |

The demo defaults to the **3D solar system view** (planet-to-planet journey through a live hazard field). Toggle to **Grid 2D** with the button in the top-left of the canvas at any point during the demo — all state is preserved across the switch.

---

## Architecture

```
aegis-nav/
├── backend/
│   ├── main.py                # FastAPI — all API endpoints + threat scoring
│   ├── prong1_classifier.py   # Qiskit VQC — quantum star classifier
│   ├── prong2_hazards.py      # NASA NeoWs + NOAA DONKI + debris generator
│   └── prong3_router.py       # QAOA route optimizer
│
└── frontend/
    └── src/
        ├── main.tsx            # HashRouter: / = landing, /#/demo = app
        ├── LandingPage.tsx     # Marketing page with animated counters + starfield
        ├── App.tsx             # Mission control (pipeline bar, panels, tooltips)
        └── components/
            ├── SpaceGrid.tsx   # 2D grid view + SolarSystemView (3D, planet-to-planet)
            └── StatusLog.tsx   # Terminal mission log
```

---

## Tech Stack

**Backend**
- Python 3.9 · FastAPI · Uvicorn
- Qiskit 1.4 · Qiskit Aer (local simulator) · Qiskit Machine Learning
- Circuit: `ZZFeatureMap(reps=1) ⊗ RealAmplitudes(reps=1)` — 2 qubits, COBYLA optimizer

**Frontend**
- React 19 · TypeScript · Vite 8
- React Three Fiber + Three.js — `@react-three/fiber`, `@react-three/drei`
- React Router v7 (HashRouter — works without a server)
- Tailwind CSS v4

**External Data Sources** *(no API keys required for NOAA)*
| Source | Data | Auth |
|---|---|---|
| NASA NeoWs | Near-Earth asteroid close-approach feed | Free API key (included in repo) |
| NOAA DONKI | Solar flare event feed | Public — no key needed |
| Synthetic | Orbital debris Kessler clusters | None — procedural |

---

## Quick Start

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

uvicorn main:app --reload --port 8000
```

VQC trains on first startup (~2–3 seconds). Server at `http://localhost:8000`.

```bash
# Verify
curl http://localhost:8000/
# → {"status":"Aegis-Nav online","version":"1.0.0"}
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

UI at `http://localhost:5173`. Both servers must run simultaneously.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Health check |
| `GET` | `/api/classify-star` | Run VQC — returns habitable star + confidence score |
| `GET` | `/api/quantum-circuit` | Return Qiskit circuit diagram + training metadata |
| `GET` | `/api/get-hazards` | NASA asteroids + NOAA solar flares + debris clusters |
| `POST` | `/api/get-route` | Run QAOA — returns safe waypoint route |

### Hazard response shape

```json
{
  "status": "success",
  "hazards": [
    { "x": 42, "y": 67, "threat": "high",   "label": "(2024 BX1)",          "type": "asteroid"    },
    { "x": 28, "y": 81, "threat": "medium", "label": "Solar Flare X2.1",    "type": "solar_flare" },
    { "x": 55, "y": 34, "threat": "low",    "label": "Iridium-33 Cluster",  "type": "debris"      }
  ]
}
```

---

## Quantum Pipeline Detail

### Prong 1 — Variational Quantum Classifier (VQC)

- **Circuit:** `ZZFeatureMap(reps=1)` encodes star features → `RealAmplitudes(reps=1)` as the trainable ansatz
- **Training data:** 12 labelled star samples (6 habitable, 6 unstable) — features: temperature + brightness
- **Optimizer:** COBYLA, converges in ~87–150 iterations on `AerSimulator` (runs locally, no cloud)
- **Output:** Target star grid coordinate + classification confidence percentage
- **Proof:** Full ASCII circuit diagram returned by `/api/quantum-circuit`, displayed as a modal in the UI after Prong 1 completes; every field is clickable for a plain-English explanation

### Prong 2 — Multi-Source Threat Intelligence

| Source | Data fetched | Scoring |
|---|---|---|
| **NASA NeoWs** | 7-day close-approach asteroid feed | `diameter_km × velocity_kmh` → threat weight 1–10 |
| **NOAA DONKI** | 30-day solar flare event feed | Class X→9, M→6, C→3 — mapped as sensor blackout zones |
| **Orbital debris** | Synthetic Kessler clusters (seeded by date) | Random weight 3–6, position shifts daily |

### Prong 3 — QAOA Route Optimization

- Routing problem encoded as a QUBO (Quadratic Unconstrained Binary Optimization) matrix
- Solved with Qiskit's `StatevectorSampler` on the local AerSimulator — no cloud QPU needed
- Visual route rendered using A\* pathfinding (STEP=5, CLEAR=8 grid units) for guaranteed geometric hazard clearance
- **Why quantum?** Classical brute-force evaluates `2ⁿ` path combinations. QAOA evaluates all routes simultaneously in superposition. The speedup factor is shown live in the UI after Prong 3 completes.

---

## Key UI Features

- **Pipeline progress bar** — each of the 3 prongs lights up in real time as it completes
- **Quantum circuit modal** — the actual Qiskit circuit diagram appears for 4 seconds after Prong 1 fires
- **Interactive tooltips** — click any technical term, metric, 3D object, or hazard for a plain-English explanation
- **Threat matrix** — dual display: HIGH / MED / LOW severity rows + ASTEROIDS / DEBRIS / SOL FLARE source breakdown
- **Why Quantum? panel** — shows classical ETA (`2ⁿ × 0.1ms`) vs actual QAOA compute time, live speedup factor
- **3D ↔ 2D toggle** — switch between immersive solar system view and the tactical grid view mid-demo

---

## Running for Demo Day

```bash
# Terminal 1
cd backend && source venv/bin/activate && uvicorn main:app --port 8000

# Terminal 2
cd frontend && npm run dev
```

Open `http://localhost:5173`. Hit **⚠ Simulate Comms Blackout** and watch the full pipeline fire.

> The VQC trains fresh each run — the circuit executes live, not from cache.
> Hazard positions are deterministic per session but change daily.
