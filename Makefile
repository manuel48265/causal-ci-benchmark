.PHONY: check format test experiment1 experiment2 experiment3 demo-precompute

check:
	./scripts/check.sh

format:
	./scripts/format.sh

test: 
	uv run pytest

# Resumable: run it again to continue; WORKERS=1 for the cleanest timings.
WORKERS ?= 8
experiment1:
	uv run python -m src.Experiments.Experimental_cases.run_experiment --workers $(WORKERS)

experiment2:
	uv run python -m src.Experiments.Experimental_cases.run_pc_experiment --workers $(WORKERS)

experiment3:
	uv run python -m src.Experiments.Experimental_cases.run_real_experiment --workers $(WORKERS)

# Regenerate demo/frontend/public/precomputed.json; rerun after changing the constants in demo/backend/core.py.
demo-precompute:
	uv run python -m demo.backend.precompute
