"""
Aegis-Nav: FastAPI Backend
Exposes all quantum pipeline endpoints to the React frontend.
Prong 1 (star classifier) is live. Prongs 2 & 3 are stubs for teammate.
"""

import math
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from prong1_classifier import get_safe_star_coordinate, get_quantum_proof
from prong2_hazards import get_active_hazards
from prong3_router import calculate_quantum_path

app = FastAPI(
    title="Aegis-Nav API",
    description="Quantum Emergency Space-Grid Router — Mission Control Backend",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def health_check():
    return {"status": "Aegis-Nav online", "version": "1.0.0"}


# ── Prong 1: Quantum Star Classifier (our code) ───────────────────────────────

@app.get("/api/classify-star")
def classify_star():
    """
    Runs the on-board Quantum Variational Classifier (VQC) on the local
    AerSimulator and returns the nearest habitable safe-harbor destination.
    """
    result = get_safe_star_coordinate()
    if result["status"] != "success":
        raise HTTPException(status_code=500, detail="Quantum classifier failed")
    return result


@app.get("/api/quantum-circuit")
def quantum_circuit():
    """Returns the actual Qiskit circuit diagram and VQC training metadata."""
    return get_quantum_proof()


# ── Prong 2: NASA Hazard Mapping ──────────────────────────────────────────────

def _threat_level(weight: int) -> str:
    if weight >= 8:
        return "high"
    if weight >= 4:
        return "medium"
    return "low"

@app.get("/api/get-hazards")
def get_hazards():
    """
    Fetches live asteroid data from NASA NeoWs, scores each object,
    and maps it onto the 100x100 sector grid.
    """
    try:
        raw = get_active_hazards()
        hazards = [
            {
                "x":      h["x"],
                "y":      h["y"],
                "threat": _threat_level(h["threat_weight"]),
                "label":  h["name"],
                "type":   h.get("type", "asteroid"),
            }
            for h in raw
        ]
        return {"status": "success", "hazards": hazards}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── Prong 3: QAOA Route Optimization ─────────────────────────────────────────

class RouteRequest(BaseModel):
    start:   dict
    target:  dict
    hazards: list

_THREAT_TO_WEIGHT = {"high": 9, "medium": 5, "low": 2}

@app.post("/api/get-route")
def get_route(req: RouteRequest):
    """
    Runs QAOA on the local StatevectorSampler to find the safest path
    from start to target, avoiding all hazard nodes.
    """
    try:
        # prong3_router expects numeric threat_weight; frontend sends string threat
        normalized_hazards = [
            {**h, "threat_weight": _THREAT_TO_WEIGHT.get(h.get("threat", "medium"), 5)}
            for h in req.hazards
        ]
        route = calculate_quantum_path(req.start, req.target, normalized_hazards)
        total_distance = sum(
            math.sqrt((route[i+1]["x"] - route[i]["x"])**2 + (route[i+1]["y"] - route[i]["y"])**2)
            for i in range(len(route) - 1)
        ) if len(route) > 1 else 0.0
        return {
            "status":          "success",
            "route":           route,
            "total_distance":  round(total_distance, 2),
            "qaoa_iterations": 150,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
