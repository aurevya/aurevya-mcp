# Built with the REPO ROOT as the Docker build context (not this folder) —
# it needs the sibling proposal-generator/ folder alongside mcp-server/ to
# drive the real Proposal Generator headlessly. On Railway: set
# "Root Directory" to wherever the repo checks out (usually blank/"/"),
# and "Dockerfile Path" to mcp-server/Dockerfile.
FROM node:20-slim

# Chromium's runtime libraries — Puppeteer's bundled Chromium won't launch
# on a bare slim image without these.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 \
    libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 \
    libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
    libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release \
    wget xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (cache-friendly), then copy the rest.
COPY mcp-server/package.json mcp-server/package-lock.json* ./mcp-server/
RUN cd mcp-server && npm install --omit=dev

COPY mcp-server ./mcp-server
COPY proposal-generator ./proposal-generator

WORKDIR /app/mcp-server
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "index.js"]
