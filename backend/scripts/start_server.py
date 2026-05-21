"""
Production server startup with multiple workers.
Usage: python scripts/start_server.py [--workers 4] [--port 8080]
"""
import argparse
import multiprocessing
import os
import sys


def get_cpu_count() -> int:
    """Get CPU count, defaulting to 2 if unavailable."""
    try:
        return multiprocessing.cpu_count()
    except Exception:
        return 2


def main():
    parser = argparse.ArgumentParser(description="Start ThinkTarteeb server")
    parser.add_argument(
        "--workers",
        type=int,
        default=get_cpu_count(),
        help=f"Number of worker processes (default: {get_cpu_count()})",
    )
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host to bind")
    parser.add_argument("--port", type=int, default=8080, help="Port to bind")
    parser.add_argument("--reload", action="store_true", help="Auto-reload (dev only)")
    parser.add_argument(
        "--log-level",
        type=str,
        default="info",
        choices=["debug", "info", "warning", "error", "critical"],
        help="Log level",
    )
    args = parser.parse_args()

    # Set environment variables for better performance
    os.environ["PYTHONUNBUFFERED"] = "1"
    os.environ["UVICORN_WORKERS"] = str(args.workers)

    # Import here to avoid module issues
    import uvicorn

    # Gunicorn-style multi-worker with Uvicorn
    # For production, use: gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app
    # But for pure Python startup, we use uvicorn directly with workers

    print(f"🚀 Starting ThinkTarteeb server with {args.workers} workers")
    print(f"📍 Binding to {args.host}:{args.port}")
    print(f"📝 Log level: {args.log_level}")

    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        workers=args.workers if not args.reload else 1,
        reload=args.reload,
        log_level=args.log_level,
        access_log=True,
        # Performance optimizations
        loop="uvloop" if sys.platform != "win32" else "asyncio",
        http="httptools" if sys.platform != "win32" else "h11",
        # Connection handling
        limit_concurrency=1000,  # Max concurrent connections
        limit_max_requests=10000,  # Restart worker after N requests (prevent memory leaks)
        timeout_keep_alive=30,  # Keep-alive timeout
    )


if __name__ == "__main__":
    main()
