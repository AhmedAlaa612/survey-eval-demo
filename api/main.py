from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from contextlib import asynccontextmanager
from typing import Optional
import sys
import os
import json
import logging
from datetime import datetime, timezone

from dotenv import load_dotenv
load_dotenv()

import psycopg2

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from routing_module.routing import get_routing_engine
from routing_module.network import create_network

logger = logging.getLogger(__name__)

routing_engine = None

# ── Database config (Supabase transaction pooler) ──
DB_CONFIG = {
    "host": os.getenv("db_host", ""),
    "port": os.getenv("db_port", "6543"),
    "dbname": os.getenv("db_name", "postgres"),
    "user": os.getenv("db_user", ""),
    "password": os.getenv("db_password", ""),
}


def get_db_conn():
    """Create a new psycopg2 connection (transaction-pooler safe)."""
    return psycopg2.connect(**DB_CONFIG)


def db_available() -> bool:
    return bool(DB_CONFIG["host"] and DB_CONFIG["user"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the network data once at startup."""
    global routing_engine
    print("Loading network data...")
    network_data = create_network()
    routing_engine = get_routing_engine(network_data)
    if db_available():
        try:
            conn = get_db_conn()
            conn.close()
            print(f"Database connection OK ({DB_CONFIG['host']}:{DB_CONFIG['port']})")
        except Exception as e:
            print(f"WARNING: DB connection test failed: {e}")
    else:
        print("WARNING: DB credentials not set — feedback won't be saved to DB")
    print("Server ready!")
    yield


app = FastAPI(
    title="Alexandria Routing API",
    description="Find transit routes between two coordinates",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=json.loads(os.getenv("CORS_ORIGINS", '["*"]')),
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request / Response models ---

class RouteRequest(BaseModel):
    start_lat: float = Field(..., example=31.2001)
    start_lon: float = Field(..., example=29.9187)
    end_lat: float = Field(..., example=31.2156)
    end_lon: float = Field(..., example=29.9553)
    max_transfers: int = Field(3, ge=0, le=5)
    walking_cutoff: int = Field(1200, ge=100, le=5000, description="Max walking distance in meters")
    top_k: int = Field(5, ge=1, le=20)
    restricted_modes: list[str] = Field(default_factory=list, description="Agency IDs to exclude")
    weight_time: float = Field(0.2, ge=0, le=1)
    weight_cost: float = Field(0.3, ge=0, le=1)
    weight_walk: float = Field(0.2, ge=0, le=1)
    weight_transfer: float = Field(0.3, ge=0, le=1)


# --- Endpoints ---

@app.get("/api/health")
def health():
    return {"status": "ok", "engine_loaded": routing_engine is not None}


@app.post("/api/routes")
def find_routes(req: RouteRequest):
    if routing_engine is None:
        raise HTTPException(503, "Routing engine not loaded yet")

    weights = {
        "time": req.weight_time,
        "cost": req.weight_cost,
        "walk": req.weight_walk,
        "transfer": req.weight_transfer,
    }

    result = routing_engine.find_journeys(
        start_lat=req.start_lat,
        start_lon=req.start_lon,
        end_lat=req.end_lat,
        end_lon=req.end_lon,
        max_transfers=req.max_transfers,
        walking_cutoff=req.walking_cutoff,
        weights=weights,
        restricted_modes=req.restricted_modes,
        top_k=req.top_k,
    )

    return result


@app.get("/api/routes")
def find_routes_get(
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    max_transfers: int = 3,
    walking_cutoff: int = 1200,
    top_k: int = 5,
):
    """Convenience GET endpoint with just the essentials."""
    if routing_engine is None:
        raise HTTPException(503, "Routing engine not loaded yet")

    return routing_engine.find_journeys(
        start_lat=start_lat,
        start_lon=start_lon,
        end_lat=end_lat,
        end_lon=end_lon,
        max_transfers=max_transfers,
        walking_cutoff=walking_cutoff,
        top_k=top_k,
    )


# --- Feedback submission ---

class TestResponse(BaseModel):
    """One test round from the frontend."""
    query: Optional[dict] = None
    status: str = "success"                 # "success" | "no_routes" | "error"
    error: Optional[str] = None
    api_response: Optional[dict] = None     # raw API response (for error/no-route cases)
    walking_cutoff: int = 1200
    journeys_with_feedback: Optional[list] = None  # journeys array with user feedback merged in
    overallFeedback: Optional[dict] = None


class FeedbackPayload(BaseModel):
    userCode: str
    responses: list[TestResponse]


@app.post("/api/submit-feedback")
def submit_feedback(payload: FeedbackPayload):
    """Receive all survey responses and save to PostgreSQL."""
    user_code = payload.userCode.strip()

    if not db_available():
        logger.warning("DB not configured — logging to console only")
        logger.info(json.dumps(payload.model_dump(), ensure_ascii=False, default=str))
        return {"status": "saved_locally", "tests": len(payload.responses)}

    try:
        conn = get_db_conn()
        cur = conn.cursor()

        for idx, resp in enumerate(payload.responses):
            query = resp.query or {}
            start = query.get("start") or {}
            dest = query.get("dest") or {}

            cur.execute(
                """
                INSERT INTO eval_tests (
                    user_code, test_number,
                    start_lat, start_lng, dest_lat, dest_lng,
                    walking_cutoff, status, error_message,
                    api_response, journeys_with_feedback, overall_feedback
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    user_code,
                    idx + 1,
                    start.get("lat"),
                    start.get("lng"),
                    dest.get("lat"),
                    dest.get("lng"),
                    resp.walking_cutoff,
                    resp.status,
                    resp.error,
                    json.dumps(resp.api_response, ensure_ascii=False) if resp.api_response else None,
                    json.dumps(resp.journeys_with_feedback, ensure_ascii=False) if resp.journeys_with_feedback else None,
                    json.dumps(resp.overallFeedback, ensure_ascii=False) if resp.overallFeedback else None,
                ),
            )

        conn.commit()
        cur.close()
        conn.close()

        logger.info("Saved %d test(s) for user %s", len(payload.responses), user_code)
        return {"status": "ok", "tests": len(payload.responses)}

    except Exception as e:
        logger.error("DB insert failed: %s", e)
        logger.info(json.dumps(payload.model_dump(), ensure_ascii=False, default=str))
        raise HTTPException(502, f"Failed to save to database: {e}")
