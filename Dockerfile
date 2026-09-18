FROM node:24-slim

# Headless Chrome (Puppeteer) runtime dependencies — Utils/bookingSummaryPdfRenderer.js
# launches puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] }) to
# render booking-summary PDFs. Debian slim (not alpine) is required because Puppeteer's
# bundled Chromium does not run reliably against musl libc.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# .puppeteerrc.cjs must be present BEFORE `npm ci` runs, because npm ci's
# postinstall hook (`npx puppeteer browsers install chrome`) reads it to decide
# where to download Chrome. Copying it after `npm ci` would let Puppeteer fall
# back to its default ~/.cache/puppeteer location, while the app looks for
# Chrome under ./.cache/puppeteer at runtime — the exact "Could not find
# Chrome" mismatch this file's own comments describe hitting on Render.
COPY package.json package-lock.json .puppeteerrc.cjs ./
RUN npm ci

COPY . .

EXPOSE 3001

CMD ["node", "VehicleMain.js"]
