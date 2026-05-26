# ResumeAI Frontend — React + Vite + TipTap
#
# Build context: ./frontend/
# Two-stage build:
#   1. node:20-alpine — `npm ci` + `vite build` → /app/dist
#   2. nginx:alpine   — serve dist + reverse-proxy /api → backend
#
# Build:    docker build -t resumeai-frontend ./frontend
# Run:      docker run -p 80:80 resumeai-frontend
#           (typically driven by docker-compose with backend service)

# ─────────────────────────────────────────────────────────────────────────
# Stage 1: build — compile TypeScript + bundle with Vite
# ─────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy lock file first for layer caching
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --prefer-offline

# Copy source and config files
COPY tsconfig*.json vite.config.ts tailwind.config.js postcss.config.js eslint.config.js index.html ./
COPY public ./public
COPY src ./src

# VITE_API_BASE_URL empty → frontend uses RELATIVE URLs (/api/...)
# nginx (stage 2) reverse-proxies /api/* to the backend container.
ENV VITE_API_BASE_URL=""

RUN npm run build
# Output: /app/dist (Vite default)

# ─────────────────────────────────────────────────────────────────────────
# Stage 2: runtime — nginx serves dist + reverse-proxies API
# ─────────────────────────────────────────────────────────────────────────
FROM nginx:alpine

# Replace default config with our SPA + reverse-proxy config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# nginx:alpine already runs as nginx user (uid=101) by default
# nginx:alpine listens on :80 by default

EXPOSE 80

# Health check — verify nginx is serving the SPA index
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# Use the default nginx entrypoint (already configured for signal handling)
