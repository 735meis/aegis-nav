from __future__ import annotations
import requests
import math
import random
import datetime
import logging

logger = logging.getLogger(__name__)

NASA_API_KEY = "e2t3FtEPGqmgVQbyX8gqgHDmsa6uUnnnD1v1YYFC"
NASA_BASE_URL = "https://api.nasa.gov/neo/rest/v1/feed"
GRID_SIZE = 100

# ── A-2: Raw API fetch ────────────────────────────────────────────────────────

def fetch_nasa_neos() -> list:
    today = datetime.date.today()
    end_date = (today + datetime.timedelta(days=7)).isoformat()
    try:
        resp = requests.get(
            NASA_BASE_URL,
            params={"start_date": today.isoformat(), "end_date": end_date, "api_key": NASA_API_KEY},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        raw: list = []
        for date_neos in data["near_earth_objects"].values():
            raw.extend(date_neos)
        return raw
    except Exception as exc:
        logger.warning("NASA NeoWs fetch failed: %s — using fallback hazards", exc)
        return []

# ── A-3: Extract key fields per NEO ──────────────────────────────────────────

def parse_neo(neo: dict) -> dict | None:
    try:
        close_approaches = neo.get("close_approach_data", [])
        if not close_approaches:
            return None

        diam = neo["estimated_diameter"]["kilometers"]
        diameter_km = (diam["estimated_diameter_min"] + diam["estimated_diameter_max"]) / 2
        velocity_kmh = float(close_approaches[0]["relative_velocity"]["kilometers_per_hour"])

        return {
            "id": neo["id"],
            "name": neo["name"],
            "diameter_km": diameter_km,
            "velocity_kmh": velocity_kmh,
        }
    except (KeyError, ValueError, IndexError) as exc:
        logger.warning("Skipping malformed NEO record (%s): %s", neo.get("id"), exc)
        return None

# ── A-4: Normalize to threat weight 1–10 ─────────────────────────────────────

def compute_threat_weight(diameter_km: float, velocity_kmh: float) -> int:
    # Log-normalize diameter over [0.001, 10] km → [0, 1]
    # Formula: (log10(d) - log10(0.001)) / (log10(10) - log10(0.001)) = (log10(d) + 3) / 4
    d = max(0.001, min(diameter_km, 10.0))
    norm_d = (math.log10(d) + 3.0) / 4.0
    norm_d = max(0.0, min(norm_d, 1.0))

    # Linear-normalize velocity over [0, 100 000] km/h → [0, 1]
    norm_v = min(velocity_kmh, 100_000.0) / 100_000.0

    raw = (norm_d * 0.4 + norm_v * 0.6) * 9 + 1
    return min(max(round(raw), 1), 10)

# ── A-5: Deterministic grid placement seeded by asteroid ID ──────────────────

def map_to_grid(neo_id: str) -> tuple[int, int]:
    seed = int(neo_id) % 99_999 if neo_id.isdigit() else abs(hash(neo_id)) % 99_999
    rng = random.Random(seed)
    x = rng.randint(5, 95)
    y = rng.randint(5, 95)
    return x, y

# ── A-6: Orbital debris clusters (synthetic Kessler-syndrome, seeded by date) ─

_DEBRIS_NAMES = [
    "Soyuz-MR Fragment", "Iridium-33 Cluster", "Fengyun-1C Remnant",
    "Cosmos-954 Shard",  "DMSP-5D Debris",     "Envisat Fragment",
    "NOAA-16 Shard",     "ISS Debris Field",   "Cosmos-2251 Piece",
]

def generate_debris_hazards() -> list[dict]:
    """Synthetic orbital debris clusters, seeded by calendar day so they shift daily."""
    day_seed = datetime.date.today().toordinal()
    rng = random.Random(day_seed)

    hazards: list[dict] = []
    for i in range(rng.randint(2, 3)):          # 2-3 clusters
        cx = rng.randint(15, 82)
        cy = rng.randint(15, 82)
        for j in range(rng.randint(2, 4)):       # 2-4 pieces per cluster
            hazards.append({
                "id":           f"DEB{day_seed}{i}{j}",
                "name":         rng.choice(_DEBRIS_NAMES),
                "x":            max(5, min(95, cx + rng.randint(-10, 10))),
                "y":            max(5, min(95, cy + rng.randint(-10, 10))),
                "threat_weight": rng.randint(3, 6),
                "type":         "debris",
            })
    return hazards


# ── A-7: Solar flare zones from NOAA DONKI (no API key required) ──────────────

_FLARE_CLASS = {"X": 9, "M": 6, "C": 3, "B": 1, "A": 1}

def fetch_solar_flares() -> list[dict]:
    """Fetch recent solar flare events from NOAA DONKI — no API key needed."""
    try:
        start = (datetime.date.today() - datetime.timedelta(days=30)).isoformat()
        end   = datetime.date.today().isoformat()
        resp  = requests.get(
            "https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR",
            params={"startDate": start, "endDate": end},
            timeout=10,
        )
        resp.raise_for_status()
        flares = resp.json()
        if not isinstance(flares, list):
            return []

        hazards: list[dict] = []
        for flare in flares:
            ct    = (flare.get("classType") or "C1.0").strip()
            base  = _FLARE_CLASS.get(ct[0].upper(), 3) if ct else 3
            try:
                tw = min(10, base + int(float(ct[1:]) / 3))
            except (ValueError, IndexError):
                tw = base

            flr_id = flare.get("flrID", "unknown")
            rng    = random.Random(abs(hash(flr_id)) % 99_999)
            hazards.append({
                "id":           flr_id,
                "name":         f"Solar Flare {ct}",
                "x":            rng.randint(5, 95),
                "y":            rng.randint(5, 95),
                "threat_weight": tw,
                "type":         "solar_flare",
            })
        return hazards
    except Exception as exc:
        logger.warning("DONKI solar flare fetch failed: %s — omitting solar data", exc)
        return []


# ── A-8: Public entry point ───────────────────────────────────────────────────

_FALLBACK_HAZARDS = [
    {"id": "FB001", "name": "Fallback-Alpha",   "x": 25, "y": 30, "threat_weight": 8, "type": "asteroid"},
    {"id": "FB002", "name": "Fallback-Beta",    "x": 55, "y": 20, "threat_weight": 6, "type": "asteroid"},
    {"id": "FB003", "name": "Fallback-Gamma",   "x": 40, "y": 60, "threat_weight": 9, "type": "asteroid"},
    {"id": "FB004", "name": "Fallback-Delta",   "x": 70, "y": 45, "threat_weight": 5, "type": "asteroid"},
    {"id": "FB005", "name": "Fallback-Epsilon", "x": 60, "y": 75, "threat_weight": 7, "type": "asteroid"},
]

def get_active_hazards() -> list[dict]:
    raw_neos = fetch_nasa_neos()

    asteroid_hazards: list[dict] = []
    for neo in raw_neos:
        parsed = parse_neo(neo)
        if parsed is None:
            continue
        tw = compute_threat_weight(parsed["diameter_km"], parsed["velocity_kmh"])
        x, y = map_to_grid(parsed["id"])
        asteroid_hazards.append({
            "id":           parsed["id"],
            "name":         parsed["name"],
            "x":            x,
            "y":            y,
            "threat_weight": tw,
            "type":         "asteroid",
        })

    if not asteroid_hazards:
        asteroid_hazards = list(_FALLBACK_HAZARDS)

    return asteroid_hazards + generate_debris_hazards() + fetch_solar_flares()
