# NEXUS Architecture

## System Overview

NEXUS (Natural-language EXecution and Unified Scheduling) is an autonomous agent framework
built as a TypeScript/Python monorepo. It provides a complete infrastructure for building,
deploying, and monitoring AI agents with hierarchical coordination, memory management,
security hardening, and commercial billing.

## Component Diagram

```mermaid
graph TB
    subgraph Client
        UI[React Dashboard]
    end

    subgraph API Layer
        API[Express REST API]
        AUTH[JWT Auth Middleware]
    end

    subgraph Orchestration
        IHR[IHR Runtime]
        NLAH[NLAH Loader]
        FJ[Fork-Join Engine]
        EB[Event Bus]
        TR[Tool Registry]
    end

    subgraph Agent Layer
        PA[Parent Agent]
        CA1[Child Agent 1]
        CA2[Child Agent N]
    end

    subgraph Memory
        MI[Memory Index]
        TS[Topic Store]
        TL[Transcript Log]
        CD[Compaction Daemon]
    end

    subgraph Intelligence
        ER[Edge Router]
        LS[Local Model Server]
        UB[ULTRAPLAN Bridge]
        AC[Aurora Controller]
    end

    subgraph Security
        SM[Skeptical Memory]
        SB[Sandbox Executor]
        TD[Trap Detector]
    end

    subgraph Infrastructure
        KD[KAIROS Daemon]
        BS[Billing Service]
    end

    UI --> API
    API --> AUTH
    AUTH --> IHR
    IHR --> NLAH
    IHR --> FJ
    IHR --> EB
    IHR --> TR
    IHR --> PA
    PA --> CA1
    PA --> CA2
    IHR --> MI
    IHR --> TS
    IHR --> TL
    CD --> TS
    CD --> MI
    ER --> LS
    ER --> UB
    AC --> LS
    SM --> TS
    SB --> TD
    API --> KD
    API --> BS
```

## Session Lifecycle Sequence

```mermaid
sequenceDiagram
    participant U as User
    participant API as Express API
    participant IHR as IHR Runtime
    participant NLAH as NLAH Loader
    participant LLM as LLM Client
    participant ER as Edge Router
    participant PA as Parent Agent
    participant CA as Child Agent
    participant MEM as Memory
    participant SEC as Security

    U->>API: POST /sessions {nlahId, input}
    API->>IHR: runSession()
    IHR->>NLAH: loadNLAH(agentId)
    NLAH-->>IHR: NLAH SOP document

    Note over IHR: PLAN Stage
    IHR->>LLM: complete(plan prompt)
    LLM-->>IHR: execution plan

    Note over IHR: DELEGATE Stage
    IHR->>ER: classify(subtasks)
    ER-->>IHR: EDGE/FRONTIER decisions
    IHR->>PA: spawn child agents
    PA->>CA: delegateTask()

    Note over IHR: EXECUTE Stage
    CA->>LLM: complete(task prompt)
    CA->>SEC: verify(tool input)
    SEC-->>CA: VerificationResult
    CA->>CA: execute tools (sandboxed)

    Note over IHR: VALIDATE Stage
    IHR->>LLM: validate(results)
    IHR->>MEM: write(findings)
    MEM->>SEC: verify(memory write)

    Note over IHR: REPORT Stage
    IHR->>LLM: generate report
    IHR-->>API: AgentEvents stream (SSE)
    API-->>U: SSE events
```

## Package Architecture

| Package | Language | Purpose |
|---------|----------|---------|
| `@nexus/core` | TypeScript | Shared types, interfaces, config, constants |
| `@nexus/orchestrator` | TypeScript | IHR runtime, NLAH loader, fork-join, LLM client |
| `@nexus/memory` | TypeScript + Python | 3-layer memory (index, topics, transcripts) + compaction daemon |
| `@nexus/agents` | TypeScript | Parent/child agent base classes |
| `@nexus/edge` | TypeScript + Python | Edge router, ULTRAPLAN bridge, local model server |
| `@nexus/speculative` | Python | Aurora speculative decoding controller |
| `@nexus/security` | TypeScript | Skeptical memory, sandbox executor, trap detector |
| `@nexus/daemon` | TypeScript | KAIROS background daemon with subscriptions |
| `@nexus/billing` | TypeScript | Hybrid billing (seats + usage + Stripe) |
| `@nexus/api` | TypeScript | Express REST API (15 endpoints) |
| `@nexus/ui` | TypeScript/React | Vite + Tailwind dashboard (6 views) |
| `infra` | TypeScript | Pulumi IaC (AWS ECS, S3, DynamoDB, SQS) |

## Key Design Decisions

1. **Provider-agnostic LLM layer**: Supports Anthropic, OpenAI, and local edge models via a unified `LLMClientInterface`
2. **Result<T, E> everywhere**: All fallible operations use `neverthrow` Result types — no uncaught exceptions in business logic
3. **Strict parent/child boundary**: ChildAgents have no ability to call other ChildAgents — enforced architecturally
4. **Memory-first persistence**: All state flows through the 3-layer memory system with verification before commit
5. **Security by default**: All tool executions sandboxed, all memory writes verified, 13+ trap patterns detected automatically
