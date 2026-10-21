#!/usr/bin/env bash
set -e
uv run ruff check .
uv run ruff format --check .
uv run mypy src test demo
# The Docker image has no Node, so the frontend is skipped where it is not installed.
if [ -d demo/frontend/node_modules ]; then npm --prefix demo/frontend run format:check; fi
uv run pytest
