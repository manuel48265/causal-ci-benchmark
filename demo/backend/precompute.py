"""Compute the results that the demo shows without running PC.

Run it with ``python -m demo.backend.precompute``; it writes ``PRECOMPUTED_PATH``.
"""

import json
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from demo.backend.core import SCENARIOS, DemoCase, compute_case

PRECOMPUTED_PATH = Path(__file__).parents[1] / "frontend" / "public" / "precomputed.json"
SEEDS = range(10)


def main() -> None:
    cases = [DemoCase(seed, scenario) for seed in SEEDS for scenario in SCENARIOS]
    # One case per process; map keeps the results in the order of ``cases``.
    with ProcessPoolExecutor() as pool:
        results = []
        for i, result in enumerate(pool.map(compute_case, cases), 1):
            print(f"[{i}/{len(cases)}] {result['case']}", flush=True)
            results.append(result)
    PRECOMPUTED_PATH.write_text(json.dumps(results))


if __name__ == "__main__":
    main()
