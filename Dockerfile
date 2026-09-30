# syntax=docker/dockerfile:1

FROM node:22.12-bookworm-slim AS frontend-builder

WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci

COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build


FROM python:3.12-slim-bookworm AS python-builder

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        build-essential \
        libcairo2-dev \
        pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY backend/requirements.txt ./requirements.txt
RUN python -m venv /opt/venv \
    && /opt/venv/bin/python -m pip install --no-cache-dir -r requirements.txt


FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    CALIBRI_FONT_DIR=/fonts \
    PATH=/opt/venv/bin:$PATH

WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends libcairo2 \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 10001 cover \
    && useradd --uid 10001 --gid cover --no-create-home \
        --home-dir /app --shell /usr/sbin/nologin cover

COPY --from=python-builder /opt/venv /opt/venv
COPY --chown=cover:cover backend ./backend
COPY --chown=cover:cover public ./public
COPY --from=frontend-builder --chown=cover:cover /build/dist ./dist

RUN mkdir -p /app/data /fonts && chown -R cover:cover /app/data

USER cover

EXPOSE 8000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"]

CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
