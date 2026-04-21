import os


Bind = os.getenv("GUNICORN_BIND", "127.0.0.1:8000")
Workers = int(os.getenv("GUNICORN_WORKERS", "1"))
Threads = int(os.getenv("GUNICORN_THREADS", "1"))
Timeout = int(os.getenv("GUNICORN_TIMEOUT", "120"))


bind = Bind

# This app stores runtime state in process memory and persists it to disk.
# Running multiple workers would create diverging copies of sessions, balances,
# rewards, and chat state across processes.
workers = max(1, Workers)
threads = max(1, Threads)
timeout = max(30, Timeout)

accesslog = "-"
errorlog = "-"
capture_output = True
