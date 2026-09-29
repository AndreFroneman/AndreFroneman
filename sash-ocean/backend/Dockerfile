# syntax=docker/dockerfile:1.7
# SASH Ocean API / worker image (non-root, no build tools in the final image).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN groupadd --system sash && useradd --system --gid sash --home-dir /app --shell /usr/sbin/nologin sash
WORKDIR /app

COPY requirements.txt .
# Optional corporate/TLS-inspection proxy CA: pass with --secret id=ca_bundle,src=/path/ca.pem
RUN --mount=type=secret,id=ca_bundle,required=false \
    if [ -f /run/secrets/ca_bundle ]; then export PIP_CERT=/run/secrets/ca_bundle; fi; \
    pip install -r requirements.txt

COPY alembic.ini ./
COPY alembic ./alembic
COPY config ./config
COPY data ./data
COPY app ./app

USER sash
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD python -c "import sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"

# Apply migrations, then serve. The worker service overrides the command.
CMD ["sh", "-c", "python -m app.cli migrate && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]
