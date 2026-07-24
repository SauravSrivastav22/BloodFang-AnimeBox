# BloodFang streaming backend — container image for free push-to-deploy hosts
# (Koyeb / Render / Fly / any Docker PaaS). Backend-only: the frontend stays on
# Firebase. The server (server/index.js) only needs npm deps + Node built-ins,
# so we copy just package.json + server/ — no frontend build required.
#
# The host injects the port via $PORT; server/index.js already reads it
# (process.env.PORT). Health check path: /api/health.

FROM node:22-slim

WORKDIR /app

# Install production deps only (skips vite/oxlint/etc.). Copy manifests first so
# this layer caches unless dependencies change.
COPY package.json package-lock.json ./
RUN npm install --omit=dev

# The API code. "type":"module" comes from package.json (already copied).
COPY server ./server

ENV NODE_ENV=production
# Documentation only — the platform overrides with its own $PORT.
EXPOSE 8000

CMD ["node", "server/index.js"]
