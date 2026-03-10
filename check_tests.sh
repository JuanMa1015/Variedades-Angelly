#!/usr/bin/env bash
set -euo pipefail

cd backend
pytest --cov=src --cov-report=term-missing --cov-report=html
behave
