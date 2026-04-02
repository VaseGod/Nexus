FROM node:20-slim AS builder

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/core/ packages/core/
COPY packages/orchestrator/ packages/orchestrator/
COPY packages/memory/ packages/memory/
COPY packages/edge/ packages/edge/
COPY packages/security/ packages/security/
COPY packages/daemon/ packages/daemon/
COPY packages/billing/ packages/billing/
COPY packages/api/ packages/api/

RUN corepack enable && pnpm install --frozen-lockfile || pnpm install
RUN pnpm -r build

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app .
EXPOSE 3000
CMD ["node", "packages/api/dist/index.js"]
