# ==========================================
# Multi-stage Dockerfile for ReachInbox Scheduler
# Builds React frontend and Express backend into a single image
# ==========================================

# 1. Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# Leave empty so API calls are relative to current origin
ENV VITE_API_URL=""
RUN npm run build

# 2. Build Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# 3. Production Runtime
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install only production dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy compiled backend code
COPY --from=backend-builder /app/backend/dist ./backend/dist

# Copy built frontend assets
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

WORKDIR /app/backend
EXPOSE 4000

CMD ["node", "dist/server.js"]
