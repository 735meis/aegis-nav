import sys
import os

# Make the backend directory importable (prong1_classifier, prong2_hazards, prong3_router)
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend'))

from main import app  # noqa: F401  — Vercel picks up the ASGI `app` export
