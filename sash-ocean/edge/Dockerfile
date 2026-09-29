# syntax=docker/dockerfile:1.7
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN groupadd --system sash && useradd --system --gid sash --home-dir /opt/sash-edge sash \
    && mkdir -p /var/lib/sash-edge && chown sash:sash /var/lib/sash-edge
WORKDIR /opt/sash-edge
COPY requirements.txt .
RUN --mount=type=secret,id=ca_bundle,required=false \
    if [ -f /run/secrets/ca_bundle ]; then export PIP_CERT=/run/secrets/ca_bundle; fi; pip install -r requirements.txt
COPY sash_edge ./sash_edge
USER sash
VOLUME ["/var/lib/sash-edge"]
CMD ["python", "-m", "sash_edge.main"]
