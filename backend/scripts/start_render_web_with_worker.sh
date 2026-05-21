#!/usr/bin/env bash
# Render free tier: run API (HTTP on $PORT) + ARQ worker in one Web Service.
# Background Worker is a paid Render type; this avoids a separate worker service.
set -euo pipefail

PORT="${PORT:-8080}"

echo "[start] Launching ARQ worker in background..."
arq app.worker.settings.WorkerSettings &
ARQ_PID=$!

cleanup() {
  echo "[start] Shutting down ARQ worker (pid=$ARQ_PID)..."
  kill "$ARQ_PID" 2>/dev/null || true
  wait "$ARQ_PID" 2>/dev/null || true
}
trap cleanup EXIT TERM INT

echo "[start] Starting API on 0.0.0.0:${PORT}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
