# syntax=docker/dockerfile:1

# ---- 1. 웹 UI 빌드 (Svelte + Vite) ----
FROM node:20-alpine AS web-build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- 2. 서버 의존성 설치 (better-sqlite3 네이티브 빌드용 도구 포함) ----
FROM node:20-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- 3. 런타임 이미지 ----
FROM node:20-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server/ ./server/
COPY --from=web-build /app/web/dist ./web/dist

ENV PORT=3002
EXPOSE 3002

CMD ["node", "server/server.js"]
