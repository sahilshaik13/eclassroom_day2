"""
Gunicorn configuration for production deployment.

Usage:
    gunicorn -c scripts/gunicorn.conf.py app.main:app

Or with environment variables:
    WORKERS=4 PORT=8080 gunicorn -c scripts/gunicorn.conf.py app.main:app
"""
import multiprocessing
import os

# Server socket
bind = f"0.0.0.0:{os.getenv('PORT', '8080')}"

# Worker processes - auto-detect CPU cores
workers = int(os.getenv("WORKERS", multiprocessing.cpu_count() * 2 + 1))

# Worker class - use Uvicorn for ASGI
worker_class = "uvicorn.workers.UvicornWorker"

# Worker connections - max concurrent requests per worker
worker_connections = 1000

# Worker temporary directory
worker_tmp_dir = "/dev/shm" if os.path.exists("/dev/shm") else None

# Maximum requests per worker before restart (prevents memory leaks)
max_requests = 10000
max_requests_jitter = 1000

# Timeout settings (seconds)
timeout = 120
keepalive = 5
graceful_timeout = 30

# Preload application - reduces memory usage
preload_app = True

# Logging
accesslog = "-"  # Log to stdout
errorlog = "-"   # Log to stderr
loglevel = os.getenv("LOG_LEVEL", "info")

# Process naming
proc_name = "thinktarteeb-api"

# Server mechanics
daemon = False
pidfile = None

# SSL (handled by reverse proxy/load balancer)
# forwarded_allow_ips = '*'
# secure_scheme_headers = {
#     'X-FORWARDED-PROTOCOL': 'ssl',
#     'X-FORWARDED-PROTO': 'https',
#     'X-FORWARDED-SSL': 'on'
# }


def on_starting(server):
    """Called just before the master process is initialized."""
    print(f"🚀 Gunicorn starting with {workers} workers")


def on_reload(server):
    """Called when receiving SIGHUP signal."""
    print("🔄 Gunicorn reloading workers")


def when_ready(server):
    """Called just after the server is started."""
    print(f"✅ Server ready on {bind}")


def worker_int(worker):
    """Called when a worker receives SIGINT or SIGQUIT."""
    print(f"⚠️ Worker {worker.pid} interrupted")


def on_exit(server):
    """Called just before exiting Gunicorn."""
    print("🛑 Gunicorn shutting down")
