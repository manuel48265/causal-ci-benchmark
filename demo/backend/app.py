"""HTTP API of the demo.

The precomputed results are always served. Running PC on a new case is enabled only when the
environment variable ``DEMO_COMPUTE`` is ``1``, so the public demo does not compute.

Run it with ``uvicorn demo.backend.app:app`` from the root of the repository.

The current demo does not use this API: running PC on a case takes minutes with KCI and
CMIknn, so the frontend only shows the results of ``precompute``. It is kept for a future
compute mode.
"""

import json
import os
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from demo.backend.core import DEMO_TESTS, N_SAMPLES, SCENARIOS, DemoCase, compute_case
from demo.backend.precompute import PRECOMPUTED_PATH

COMPUTE_ENABLED = os.environ.get("DEMO_COMPUTE") == "1"
PRECOMPUTED: list[dict[str, Any]] = (
    [{**case, "source": "precomputed"} for case in json.loads(PRECOMPUTED_PATH.read_text())]
    if PRECOMPUTED_PATH.exists()
    else []
)

app = FastAPI()


class CaseRequest(BaseModel):
    seed: int = Field(ge=0)
    scenario: str
    n_nodes: int = Field(ge=2, le=20)
    edge_prob: float = Field(ge=0, le=1)


@app.get("/api/config")
def config() -> dict[str, Any]:
    return {
        "compute_enabled": COMPUTE_ENABLED,
        "scenarios": list(SCENARIOS),
        "n_samples": list(N_SAMPLES),
        "tests": list(DEMO_TESTS),
    }


@app.get("/api/cases")
def cases() -> list[dict[str, Any]]:
    return PRECOMPUTED


@app.post("/api/compute")
def compute(request: CaseRequest) -> dict[str, Any]:
    if not COMPUTE_ENABLED:
        raise HTTPException(403, "computing is disabled in this deployment")
    try:
        result = compute_case(DemoCase(**request.model_dump()))
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    return {**result, "source": "computed"}
