# Aegis-Nav: Quantum Emergency Space-Grid Router

> Track 3: Systems Under Pressure — Hackathon Project

---

## Team Division

| Owner | Scope |
|---|---|
| **You** | React frontend · FastAPI `main.py` · Prong 1 (Quantum Star Classifier) |
| **Teammate** | Prong 2 (NASA Hazard API) · Prong 3 (QAOA Route Optimizer) |

---

## Running the Project

### Backend

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

Server starts at `http://localhost:8000`. VQC trains on startup (~2 sec).

### Frontend

```bash
cd frontend
npm run dev
```

UI starts at `http://localhost:5173`. Click the red button to trigger the pipeline.

---

## API Endpoints

| Method | Path | Status | Owner |
|---|---|---|---|
| GET | `/` | Live | Us |
| GET | `/api/classify-star` | Live | Us — Prong 1 |
| GET | `/api/get-hazards` | 501 stub | **Teammate — Prong 2** |
| GET | `/api/get-route` | 501 stub | **Teammate — Prong 3** |

---

## Teammate Integration Points

### Prong 2 — NASA Hazard Mapping

In `backend/main.py`, replace the stub at `GET /api/get-hazards`:

```python
# Expected response shape:
{
  "status": "success",
  "hazards": [
    {
      "x": int,           # grid coord 0-100
      "y": int,           # grid coord 0-100
      "threat": "high" | "medium" | "low",
      "label": str,       # e.g. "2024 BX1"
      "diameter_km": float,
      "velocity_km_s": float
    }
  ]
}
```

### Prong 3 — QAOA Route Optimizer

In `backend/main.py`, replace the stub at `GET /api/get-route`:

```python
# Expected response shape:
{
  "status": "success",
  "route": [
    { "x": int, "y": int },   # ordered waypoints, ship → target
    ...
  ],
  "total_distance": float,
  "qaoa_iterations": int
}
```

### Frontend hooks (already wired — just fill in the fetch calls)

In `frontend/src/App.tsx`, two stub functions at the top of the file:

```typescript
async function fetchHazards(): Promise<HazardNode[]> {
  // TODO: replace with GET /api/get-hazards
  return []
}

async function fetchQuantumRoute(...): Promise<RouteNode[]> {
  // TODO: replace with GET /api/get-route
  return []
}
```

---

## Dependencies

All free, all local — no cloud accounts or API keys required for core functionality.

```
Backend:  fastapi · uvicorn · qiskit · qiskit-aer · qiskit-machine-learning · numpy
Frontend: React 19 · Vite · TypeScript · Tailwind CSS v4
```

NASA API key (free at api.nasa.gov) needed only for Prong 2.
