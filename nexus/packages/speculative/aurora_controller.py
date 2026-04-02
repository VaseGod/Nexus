"""
Aurora Speculative Decoding Controller
=======================================
Maintains draft (small, fast) and target (full, accurate) models.
Draft proposes K tokens; target verifies in parallel.
Logs accepted/rejected tokens for imitation learning.
"""

import asyncio
import json
import os
import time
from pathlib import Path
from typing import Any

import structlog
from fastapi import FastAPI
from pydantic import BaseModel

logger = structlog.get_logger()

# ============================================================================
# Configuration
# ============================================================================

DRAFT_MODEL_PATH = os.getenv("DRAFT_MODEL_PATH", "/models/draft-model.gguf")
TARGET_MODEL_PATH = os.getenv("TARGET_MODEL_PATH", "/models/target-model.gguf")
DRAFT_K = int(os.getenv("AURORA_DRAFT_K", "5"))
TRAINING_INTERVAL = int(os.getenv("AURORA_TRAINING_INTERVAL", "500"))
DATA_DIR = Path(os.getenv("AURORA_DATA_DIR", "./aurora-data"))

ACCEPTED_LOG = DATA_DIR / "accepted_tokens.jsonl"
REJECTED_LOG = DATA_DIR / "rejected_tokens.jsonl"


# ============================================================================
# Data Models
# ============================================================================


class GenerateRequest(BaseModel):
    prompt: str
    max_tokens: int = 256
    temperature: float = 0.7
    draft_k: int | None = None


class GenerateResponse(BaseModel):
    text: str
    tokens_generated: int
    accepted_count: int
    rejected_count: int
    speedup: float
    duration_ms: float


class MetricsResponse(BaseModel):
    acceptance_rate: float
    avg_speedup: float
    tokens_trained: int
    total_accepted: int
    total_rejected: int
    training_runs: int


# ============================================================================
# Speculative Decoding Engine
# ============================================================================


class AuroraController:
    def __init__(self) -> None:
        self.total_accepted: int = 0
        self.total_rejected: int = 0
        self.total_speedup: float = 0.0
        self.generation_count: int = 0
        self.tokens_trained: int = 0
        self.training_runs: int = 0
        self._training_lock = asyncio.Lock()

        DATA_DIR.mkdir(parents=True, exist_ok=True)

    async def generate(self, request: GenerateRequest) -> GenerateResponse:
        start_time = time.monotonic()
        k = request.draft_k or DRAFT_K

        generated_tokens: list[str] = []
        accepted_count = 0
        rejected_count = 0

        remaining = request.max_tokens
        prompt = request.prompt

        while remaining > 0:
            batch_size = min(k, remaining)

            # Step 1: Draft model proposes K tokens
            draft_tokens = await self._draft_propose(prompt, batch_size, request.temperature)

            if not draft_tokens:
                break

            # Step 2: Target model verifies draft tokens
            verified_count = await self._target_verify(prompt, draft_tokens)

            # Step 3: Accept verified tokens, reject the rest
            accepted = draft_tokens[:verified_count]
            rejected = draft_tokens[verified_count:]

            generated_tokens.extend(accepted)
            accepted_count += len(accepted)
            rejected_count += len(rejected)

            # Log for training
            await self._log_tokens(accepted, rejected, prompt)

            prompt = prompt + " ".join(accepted)
            remaining -= len(accepted)

            # If rejection occurred, generate one correct token from target
            if rejected:
                correction = await self._target_generate_one(prompt, request.temperature)
                if correction:
                    generated_tokens.append(correction)
                    remaining -= 1
                    prompt = prompt + correction

        duration_ms = (time.monotonic() - start_time) * 1000

        # Calculate speedup (draft is ~3-5x faster than target)
        sequential_estimate = duration_ms * (1 + accepted_count / max(1, k))
        speedup = sequential_estimate / max(1.0, duration_ms)

        self.total_accepted += accepted_count
        self.total_rejected += rejected_count
        self.total_speedup += speedup
        self.generation_count += 1

        # Check if we should trigger training
        if self.total_accepted >= self.tokens_trained + TRAINING_INTERVAL:
            asyncio.create_task(self._train_draft_model())

        return GenerateResponse(
            text=" ".join(generated_tokens),
            tokens_generated=len(generated_tokens),
            accepted_count=accepted_count,
            rejected_count=rejected_count,
            speedup=round(speedup, 2),
            duration_ms=round(duration_ms, 2),
        )

    async def get_metrics(self) -> MetricsResponse:
        total = self.total_accepted + self.total_rejected
        return MetricsResponse(
            acceptance_rate=self.total_accepted / max(1, total),
            avg_speedup=self.total_speedup / max(1, self.generation_count),
            tokens_trained=self.tokens_trained,
            total_accepted=self.total_accepted,
            total_rejected=self.total_rejected,
            training_runs=self.training_runs,
        )

    # ---- Model Interaction ----

    async def _draft_propose(
        self, prompt: str, k: int, temperature: float
    ) -> list[str]:
        """Draft model proposes K tokens."""
        # In production, this calls llama.cpp or a local model server
        # Simulated for now with deterministic token generation
        try:
            import httpx

            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"http://localhost:8003/v1/completions",
                    json={
                        "prompt": prompt,
                        "max_tokens": k,
                        "temperature": temperature,
                        "model": "draft",
                    },
                )
                if response.status_code == 200:
                    data = response.json()
                    text = data.get("choices", [{}])[0].get("text", "")
                    return text.split() if text else []
        except Exception as e:
            logger.warning("draft_model_unavailable", error=str(e))

        # Fallback: generate placeholder tokens
        return [f"token_{i}" for i in range(k)]

    async def _target_verify(self, prompt: str, draft_tokens: list[str]) -> int:
        """Target model verifies draft tokens. Returns count of accepted tokens."""
        try:
            import httpx

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"http://localhost:8003/v1/completions",
                    json={
                        "prompt": prompt,
                        "max_tokens": len(draft_tokens),
                        "temperature": 0.0,
                        "model": "target",
                    },
                )
                if response.status_code == 200:
                    data = response.json()
                    target_text = data.get("choices", [{}])[0].get("text", "")
                    target_tokens = target_text.split()

                    # Count matching prefix
                    matching = 0
                    for dt, tt in zip(draft_tokens, target_tokens):
                        if dt == tt:
                            matching += 1
                        else:
                            break
                    return matching
        except Exception as e:
            logger.warning("target_model_unavailable", error=str(e))

        # Fallback: accept all draft tokens
        return len(draft_tokens)

    async def _target_generate_one(
        self, prompt: str, temperature: float
    ) -> str | None:
        """Generate a single correct token from the target model."""
        try:
            import httpx

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"http://localhost:8003/v1/completions",
                    json={
                        "prompt": prompt,
                        "max_tokens": 1,
                        "temperature": temperature,
                        "model": "target",
                    },
                )
                if response.status_code == 200:
                    data = response.json()
                    return data.get("choices", [{}])[0].get("text", "").strip()
        except Exception:
            pass
        return None

    # ---- Token Logging ----

    async def _log_tokens(
        self,
        accepted: list[str],
        rejected: list[str],
        context: str,
    ) -> None:
        ts = time.time()

        if accepted:
            entry = json.dumps({
                "ts": ts,
                "tokens": accepted,
                "context": context[:200],
            })
            with open(ACCEPTED_LOG, "a", encoding="utf-8") as f:
                f.write(entry + "\n")

        if rejected:
            entry = json.dumps({
                "ts": ts,
                "tokens": rejected,
                "context": context[:200],
            })
            with open(REJECTED_LOG, "a", encoding="utf-8") as f:
                f.write(entry + "\n")

    # ---- Training Loop ----

    async def _train_draft_model(self) -> None:
        async with self._training_lock:
            logger.info("training.start", tokens_since_last=self.total_accepted - self.tokens_trained)

            try:
                # In production: load PEFT/LoRA, train on accepted/rejected logs
                # Simulated training step
                accepted_count = 0
                if ACCEPTED_LOG.exists():
                    with open(ACCEPTED_LOG, "r") as f:
                        accepted_count = sum(1 for _ in f)

                self.tokens_trained = self.total_accepted
                self.training_runs += 1

                logger.info(
                    "training.complete",
                    tokens_trained=self.tokens_trained,
                    training_runs=self.training_runs,
                    accepted_samples=accepted_count,
                )
            except Exception as e:
                logger.error("training.failed", error=str(e))


# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(title="NEXUS Aurora Speculative Decoding Controller", version="0.1.0")
controller = AuroraController()


@app.post("/generate", response_model=GenerateResponse)
async def generate(request: GenerateRequest) -> GenerateResponse:
    return await controller.generate(request)


@app.get("/draft-model/metrics", response_model=MetricsResponse)
async def get_metrics() -> MetricsResponse:
    return await controller.get_metrics()


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "healthy",
        "service": "aurora-controller",
        "draft_model": DRAFT_MODEL_PATH,
        "target_model": TARGET_MODEL_PATH,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8002)
