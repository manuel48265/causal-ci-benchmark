#!/usr/bin/env bash
set -e
uv run ruff format .
uv run ruff check --fix .
# The Docker image has no Node, so the frontend is skipped where it is not installed.
if [ -d demo/frontend/node_modules ]; then npm --prefix demo/frontend run format; fi
