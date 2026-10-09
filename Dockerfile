# ============================================================================
# FormCraft Studio - Production Dockerfile
# Optimized, secure, lightweight Node.js container
# ============================================================================

FROM node:20-alpine AS base

# Install dumb-init for proper PID 1 signal forwarding
RUN apk add --no-cache dumb-init

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production --ignore-scripts

# Copy application source
COPY . .

# Create persistent data directory and grant permissions to node user
RUN mkdir -p /app/data && chown -R node:node /app

# Switch to non-root user
USER node

# Environment Defaults
ENV NODE_ENV=production
ENV PORT=3005

EXPOSE 3005

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3005/api/config || exit 1

# Launch with dumb-init for clean graceful shutdown
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
