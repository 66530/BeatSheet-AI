# AI-NUSS 3.0 — Frontend Dockerfile
# Next.js App Router with TailwindCSS
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY ai_nuss_frontend/package.json ai_nuss_frontend/package-lock.json* ./
RUN npm ci --legacy-peer-deps 2>/dev/null || npm install --legacy-peer-deps

# Copy source
COPY ai_nuss_frontend .

# Build Next.js
RUN npm run build

# Production image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy build artifacts
COPY --from=builder /app/.next /app/.next
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/next.config.js /app/next.config.js
COPY --from=builder /app/public /app/public 2>/dev/null || true

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

CMD ["npm", "start"]
