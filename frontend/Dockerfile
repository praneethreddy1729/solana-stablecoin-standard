FROM node:20-alpine AS builder
WORKDIR /app
# Copy SDK dependency (frontend imports from ../../../sdk/core/src)
COPY sdk/core/ /app/sdk/core/
# Copy frontend package files and install dependencies
COPY frontend/package.json frontend/yarn.lock* ./frontend/
WORKDIR /app/frontend
RUN yarn install --frozen-lockfile || yarn install
# Copy frontend source
COPY frontend/ .
RUN yarn build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/frontend/.next ./.next
COPY --from=builder /app/frontend/node_modules ./node_modules
COPY --from=builder /app/frontend/package.json ./
COPY --from=builder /app/frontend/public ./public
EXPOSE 3000
CMD ["yarn", "start"]
