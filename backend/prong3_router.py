import math
import logging

logger = logging.getLogger(__name__)

from qiskit_optimization import QuadraticProgram
from qiskit_optimization.algorithms import MinimumEigenOptimizer
from qiskit_algorithms import QAOA
from qiskit_algorithms.optimizers import COBYLA
from qiskit.primitives import StatevectorSampler

NUM_WAYPOINTS = 6   # 6 binary qubits — single-arc corridor, fast on StatevectorSampler
BASE_REWARD = 5.0   # small incentive to select a hazard-free waypoint
HAZARD_PENALTY = 150.0  # dominates BASE_REWARD when near a hazard
DIST_WEIGHT = 0.05  # light distance cost between adjacent waypoints
QAOA_REPS = 1       # p=1 QAOA layer; sufficient for demo, compiles in seconds

# ── B-2: Generate 6 candidate waypoints along a single offset arc ────────────
# Single corridor (no two-row zigzag) so assemble_path never crosses the
# direct axis and connecting segments stay clear of on-axis hazards.

def generate_waypoints(start: dict, target: dict, n: int = NUM_WAYPOINTS) -> list[tuple[int, int]]:
    sx, sy = start["x"], start["y"]
    tx, ty = target["x"], target["y"]
    dx, dy = tx - sx, ty - sy
    length = math.sqrt(dx * dx + dy * dy) or 1.0

    # Perpendicular unit vector (rotated 90° CCW) — offset to one side only
    px, py = -dy / length, dx / length
    offset = 20.0  # grid units perpendicular to the direct axis

    waypoints: list[tuple[int, int]] = []
    for i in range(n):
        t = (i + 1) / (n + 1)
        ax, ay = sx + t * dx, sy + t * dy
        wx = int(min(max(round(ax + offset * px), 0), 99))
        wy = int(min(max(round(ay + offset * py), 0), 99))
        waypoints.append((wx, wy))

    return waypoints

# ── B-3: Per-waypoint hazard penalty (collision zone + warning zone) ──────────

def compute_hazard_penalty(wx: int, wy: int, hazards: list[dict]) -> float:
    total = 0.0
    for h in hazards:
        dist = math.sqrt((wx - h["x"]) ** 2 + (wy - h["y"]) ** 2)
        if dist < 12:
            total += HAZARD_PENALTY * h["threat_weight"]
        elif dist < 15:
            total += HAZARD_PENALTY * h["threat_weight"] * 0.3
    return total

# ── B-4: Build the QUBO QuadraticProgram ─────────────────────────────────────

def build_qubo(waypoints: list[tuple[int, int]], hazard_nodes: list[dict]) -> QuadraticProgram:
    n = len(waypoints)
    qp = QuadraticProgram("aegis_route")

    for i in range(n):
        qp.binary_var(f"x{i}")

    # Linear terms: hazard cost minus base reward per waypoint
    linear: dict[str, float] = {}
    for i, (wx, wy) in enumerate(waypoints):
        penalty = compute_hazard_penalty(wx, wy, hazard_nodes)
        linear[f"x{i}"] = penalty - BASE_REWARD

    # Quadratic terms: distance cost between consecutive waypoints (single arc)
    quadratic: dict[tuple[str, str], float] = {}
    for i in range(n - 1):
        d = math.sqrt(
            (waypoints[i][0] - waypoints[i + 1][0]) ** 2
            + (waypoints[i][1] - waypoints[i + 1][1]) ** 2
        )
        quadratic[(f"x{i}", f"x{i + 1}")] = d * DIST_WEIGHT

    qp.minimize(linear=linear, quadratic=quadratic)
    return qp

# ── B-5: Run QAOA on local AerSimulator, return binary selection array ────────

def run_qaoa(qp: QuadraticProgram) -> list[int]:
    sampler = StatevectorSampler()
    optimizer = COBYLA(maxiter=150)
    qaoa = QAOA(sampler=sampler, optimizer=optimizer, reps=QAOA_REPS)
    # MinimumEigenOptimizer handles QuadraticProgram → QUBO conversion internally
    result = MinimumEigenOptimizer(qaoa).solve(qp)
    return [
        0 if math.isnan(float(v)) else int(round(float(v)))
        for v in result.x
    ]

# ── B-6: Assemble ordered route from selected waypoints ───────────────────────

def assemble_path(
    start: dict,
    target: dict,
    waypoints: list[tuple[int, int]],
    selection: list[int],
) -> list[dict]:
    chosen = [waypoints[i] for i, s in enumerate(selection) if s == 1]

    # Sort by projection onto start→target direction so path doesn't zigzag backward
    dx = target["x"] - start["x"]
    dy = target["y"] - start["y"]
    chosen.sort(key=lambda p: p[0] * dx + p[1] * dy)

    # Deduplicate consecutive identical coords that can arise from grid rounding
    seen: set[tuple[int, int]] = set()
    unique: list[tuple[int, int]] = []
    for p in chosen:
        if p not in seen:
            seen.add(p)
            unique.append(p)

    return [start] + [{"x": x, "y": y} for x, y in unique] + [target]

# ── Fallback: straight-line path with 3 intermediate points ──────────────────

def _straight_line_fallback(start: dict, target: dict) -> list[dict]:
    path = [start]
    for t in [0.25, 0.5, 0.75]:
        path.append({
            "x": int(round(start["x"] + t * (target["x"] - start["x"]))),
            "y": int(round(start["y"] + t * (target["y"] - start["y"]))),
        })
    path.append(target)
    return path

# ── B-7: Public entry point ───────────────────────────────────────────────────

def calculate_quantum_path(start: dict, target: dict, hazards: list[dict]) -> list[dict]:
    try:
        waypoints = generate_waypoints(start, target, NUM_WAYPOINTS)
        qp = build_qubo(waypoints, hazards)
        selection = run_qaoa(qp)
        return assemble_path(start, target, waypoints, selection)
    except Exception as exc:
        logger.warning("QAOA fallback triggered: %s", exc)
        return _straight_line_fallback(start, target)
