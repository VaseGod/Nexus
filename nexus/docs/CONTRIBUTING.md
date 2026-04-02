# Contributing to NEXUS

## Prerequisites

- **Node.js** 20+ (via `nvm` recommended)
- **pnpm** 9+ (`corepack enable && corepack prepare pnpm@9.1.0 --activate`)
- **Python** 3.11+ (for ML services)
- **Docker** & **Docker Compose** (for running all services)

## Monorepo Setup

```bash
# Clone and install
git clone <repo-url> && cd nexus
pnpm install

# Copy environment config
cp .env.example .env
# Edit .env with your API keys

# Build all packages
pnpm build

# Run tests
pnpm test
```

## Running Services Locally

### Option 1: Docker Compose (recommended)

```bash
docker-compose up -d
# API: http://localhost:3000
# UI:  http://localhost:5173
# Compaction Worker: http://localhost:8001
# Aurora Controller: http://localhost:8002
# Edge Server: http://localhost:8003
```

### Option 2: Individual services

```bash
# Terminal 1: API
cd packages/api && pnpm dev

# Terminal 2: UI
cd packages/ui && pnpm dev

# Terminal 3: Compaction Worker
cd packages/memory/workers && python compaction_daemon.py

# Terminal 4: Aurora Controller
cd packages/speculative && python aurora_controller.py

# Terminal 5: Edge Server
cd packages/edge && python local_server.py
```

## Useful Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all TypeScript packages |
| `pnpm test` | Run all Vitest test suites |
| `pnpm lint` | Lint all packages |
| `pnpm dev` | Start all dev servers |
| `pnpm -r clean` | Clean all build artifacts |

## Code Style

- TypeScript: `strict` mode, no `any`, explicit return types
- All async: `async/await`, never raw Promise chains
- All I/O: wrapped in `Result<T, E>` from `neverthrow`
- Logging: `pino` (TS) / `structlog` (Python), always include `session_id` and `agent_id`
- No hardcoded strings: all config in typed config files

## Adding a New Package

1. Create `packages/<name>/` with `package.json`, `tsconfig.json`, `src/index.ts`
2. Add workspace dependency in consuming packages: `"@nexus/<name>": "workspace:*"`
3. Add to `turbo.json` pipeline if needed
4. Write tests in `packages/<name>/tests/`

## Pull Request Process

1. Create a feature branch from `main`
2. Write implementation with tests
3. Ensure `pnpm build && pnpm test` passes
4. Update documentation if public API changes
5. Submit PR with clear description
