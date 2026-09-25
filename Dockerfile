# syntax=docker/dockerfile:1.7
# Roadshow backend (Express 5 + Mongoose) — multi-stage.
# Puppeteer's Chrome is downloaded by the npm postinstall step into
# /app/.cache/puppeteer (see .puppeteerrc.cjs) and copied into the runtime.

ARG NODE_VERSION=24

# ---------- deps (+ Puppeteer Chrome download) ----------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
# Puppeteer's browser installer needs unzip to extract Chrome.
RUN apt-get update && apt-get install -y --no-install-recommends unzip ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .puppeteerrc.cjs ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---------- runtime ----------
FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app

# Shared libraries + fonts required by headless Chrome (booking-summary PDF).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates fonts-liberation fonts-noto-core \
      libasound2 libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 \
      libdrm2 libexpat1 libfontconfig1 libgbm1 libglib2.0-0 libgtk-3-0 \
      libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libx11-6 libx11-xcb1 \
      libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 \
      libxkbcommon0 libxrandr2 libxrender1 libxss1 libxtst6 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=deps --chown=node:node /app/.cache ./.cache
COPY --chown=node:node . .

# Local-disk upload target (used when STORAGE_TYPE != "space"); mounted as a volume.
RUN mkdir -p public/uploads && chown -R node:node public

USER node
# Port is hardcoded to 3001 in VehicleMain.js.
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('net').connect(3001,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"

CMD ["node", "VehicleMain.js"]
