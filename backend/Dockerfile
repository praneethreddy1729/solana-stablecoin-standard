# ==============================================================================
# Stage 1: Builder
# ==============================================================================
FROM node:20-slim AS builder

WORKDIR /app

# Copy SDK dependency (backend imports from ../../sdk/core/src at compile time)
COPY sdk/core/ /app/sdk/core/
COPY target/idl/ /app/target/idl/

# Install backend dependencies
COPY backend/package.json backend/yarn.lock* /app/backend/
WORKDIR /app/backend
RUN npm ci --ignore-scripts 2>/dev/null || yarn install --frozen-lockfile

# Copy backend source and compile
COPY backend/tsconfig.json backend/src/ /app/backend/
COPY backend/src/ /app/backend/src/
RUN npx tsc --outDir dist

# ==============================================================================
# Stage 2: Runtime
# ==============================================================================
FROM node:20-slim AS runtime

# Security: non-root user
RUN groupadd --system appgroup && useradd --system --gid appgroup appuser

WORKDIR /app

# Copy compiled output and production dependencies
COPY --from=builder /app/backend/dist /app/dist
COPY --from=builder /app/backend/node_modules /app/node_modules
COPY --from=builder /app/backend/package.json /app/package.json

# Copy SDK (needed at runtime for type references)
COPY --from=builder /app/sdk/core/ /app/sdk/core/
COPY --from=builder /app/target/idl/ /app/target/idl/

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
