FROM node:20-slim AS builder

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/core/ packages/core/
COPY packages/orchestrator/ packages/orchestrator/
COPY packages/daemon/ packages/daemon/

RUN corepack enable && pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @nexus/core build && pnpm --filter @nexus/orchestrator build && pnpm --filter @nexus/daemon build

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app .
CMD ["node", "packages/daemon/dist/index.js"]
