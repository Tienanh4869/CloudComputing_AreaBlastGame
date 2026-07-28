# backend/Dockerfile
FROM node:20-alpine AS base
WORKDIR /app

# Copy dependency files first (for better layer caching)
COPY package*.json ./
RUN npm ci --only=production

# Copy source only
COPY src/ ./src/

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"

# Non-root user for security
USER node

EXPOSE 3001

CMD ["node", "src/server.js"]
