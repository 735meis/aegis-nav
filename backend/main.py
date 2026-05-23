"""
Aegis-Nav: FastAPI Backend
Exposes all quantum pipeline endpoints to the React frontend.
Prong 1 (star classifier) is live. Prongs 2 & 3 are stubs for teammate.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from prong1_classifier import get_safe_star_coordinate

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


# ── Prong 2: NASA Hazard Mapping (teammate — stub) ────────────────────────────

@app.get("/api/get-hazards")
def get_hazards():
    """
    TODO (teammate): Wire up NASA NeoWs API integration here.
    Should return a list of hazard nodes mapped onto the 100x100 grid.
    Expected response shape:
    {
        "status": "success",
        "hazards": [
            { "x": int, "y": int, "threat": "high" | "medium" | "low",
              "label": str, "diameter_km": float, "velocity_km_s": float }
        ]
    }
    """
    raise HTTPException(status_code=501, detail="Prong 2 not yet implemented — teammate's module")


# ── Prong 3: QAOA Route Optimization (teammate — stub) ────────────────────────

@app.get("/api/get-route")
def get_route():
    """
    TODO (teammate): Wire up QAOA pathfinding here.
    Should accept start/end coordinates + hazard list and return optimized waypoints.
    Expected response shape:
    {
        "status": "success",
        "route": [ { "x": int, "y": int }, ... ],
        "total_distance": float,
        "qaoa_iterations": int
    }
    """
    raise HTTPException(status_code=501, detail="Prong 3 not yet implemented — teammate's module")
