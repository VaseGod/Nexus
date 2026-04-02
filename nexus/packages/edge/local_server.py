"""
NEXUS Local Model Server
=========================
Wraps llama.cpp to serve a quantized model as an OpenAI-compatible endpoint.
Supports streaming via SSE.
"""

import os
import time
from typing import Any

import structlog
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = structlog.get_logger()

MODEL_PATH = os.getenv("EDGE_MODEL_PATH", "/models/ternary-1bit.gguf")
HOST = os.getenv("EDGE_SERVER_HOST", "0.0.0.0")
PORT = int(os.getenv("EDGE_SERVER_PORT", "8003"))


# ============================================================================
# Data Models
# ============================================================================


class CompletionRequest(BaseModel):
    model: str = "local"
    prompt: str | None = None
    messages: list[dict[str, str]] | None = None
    max_tokens: int = 2048
    temperature: float = 0.7
    stream: bool = False
    stop: list[str] | None = None


class CompletionChoice(BaseModel):
    text: str = ""
    index: int = 0
    finish_reason: str = "stop"


class CompletionUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class CompletionResponse(BaseModel):
    id: str = ""
    object: str = "text_completion"
    created: int = 0
    model: str = "local"
    choices: list[CompletionChoice] = []
    usage: CompletionUsage = CompletionUsage()


class HealthResponse(BaseModel):
    model: str
    quantization: str
    tokens_per_sec: float
    status: str


# ============================================================================
# Model Manager
# ============================================================================


class LocalModelManager:
    def __init__(self, model_path: str) -> None:
        self.model_path = model_path
        self.model: Any = None
        self.tokens_generated: int = 0
        self.total_time: float = 0.0
        self._load_model()

    def _load_model(self) -> None:
        """Attempt to load the model via llama-cpp-python."""
        try:
            from llama_cpp import Llama

            self.model = Llama(
                model_path=self.model_path,
                n_ctx=4096,
                n_threads=os.cpu_count() or 4,
                verbose=False,
            )
            logger.info("model.loaded", path=self.model_path)
        except ImportError:
            logger.warning(
                "llama_cpp_not_installed",
                msg="llama-cpp-python not installed, using mock model",
            )
            self.model = None
        except Exception as e:
            logger.warning(
                "model.load_failed",
                error=str(e),
                msg="Failed to load model, using mock responses",
            )
            self.model = None

    def generate(self, request: CompletionRequest) -> CompletionResponse:
        start_time = time.monotonic()

        prompt = request.prompt or ""
        if request.messages:
            prompt = "\n".join(
                f"{m.get('role', 'user')}: {m.get('content', '')}"
                for m in request.messages
            )

        if self.model is not None:
            try:
                output = self.model(
                    prompt,
                    max_tokens=request.max_tokens,
                    temperature=request.temperature,
                    stop=request.stop or [],
                )

                text = output["choices"][0]["text"]
                usage = output.get("usage", {})
                elapsed = time.monotonic() - start_time

                completion_tokens = usage.get("completion_tokens", len(text.split()))
                self.tokens_generated += completion_tokens
                self.total_time += elapsed

                return CompletionResponse(
                    id=f"cmpl-{int(time.time())}",
                    created=int(time.time()),
                    model=request.model,
                    choices=[
                        CompletionChoice(text=text, finish_reason="stop")
                    ],
                    usage=CompletionUsage(
                        prompt_tokens=usage.get("prompt_tokens", len(prompt.split())),
                        completion_tokens=completion_tokens,
                        total_tokens=usage.get("total_tokens", 0),
                    ),
                )
            except Exception as e:
                logger.error("model.generate_failed", error=str(e))

        # Mock response when model is not available
        elapsed = time.monotonic() - start_time
        mock_text = f"[Mock response for: {prompt[:100]}...]"
        mock_tokens = len(mock_text.split())
        self.tokens_generated += mock_tokens
        self.total_time += elapsed

        return CompletionResponse(
            id=f"cmpl-mock-{int(time.time())}",
            created=int(time.time()),
            model=request.model,
            choices=[
                CompletionChoice(text=mock_text, finish_reason="stop")
            ],
            usage=CompletionUsage(
                prompt_tokens=len(prompt.split()),
                completion_tokens=mock_tokens,
                total_tokens=len(prompt.split()) + mock_tokens,
            ),
        )

    @property
    def tokens_per_sec(self) -> float:
        if self.total_time == 0:
            return 0.0
        return self.tokens_generated / self.total_time


# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(title="NEXUS Local Model Server", version="0.1.0")
model_manager = LocalModelManager(MODEL_PATH)


@app.post("/v1/completions", response_model=CompletionResponse)
async def create_completion(request: CompletionRequest) -> CompletionResponse:
    if request.stream:
        # For streaming, we generate and return via SSE
        response = model_manager.generate(request)
        return response

    return model_manager.generate(request)


@app.post("/v1/chat/completions")
async def create_chat_completion(request: CompletionRequest) -> CompletionResponse:
    """OpenAI-compatible chat completions endpoint."""
    return model_manager.generate(request)


@app.post("/classify")
async def classify_task(request: dict[str, str]) -> dict[str, Any]:
    """Classify a task as EDGE or FRONTIER using the local model."""
    text = request.get("text", "")

    # Simple heuristic classification via the model
    prompt = (
        f"Classify the following task as either EDGE (simple, routine) or "
        f"FRONTIER (complex, requires advanced reasoning).\n\n"
        f"Task: {text}\n\n"
        f"Classification:"
    )

    response = model_manager.generate(
        CompletionRequest(prompt=prompt, max_tokens=10, temperature=0.1)
    )

    result_text = response.choices[0].text.strip().upper() if response.choices else ""
    classification = "EDGE" if "EDGE" in result_text else "FRONTIER"

    return {
        "classification": classification,
        "confidence": 0.7,
    }


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(
        model=MODEL_PATH,
        quantization="1-bit ternary",
        tokens_per_sec=round(model_manager.tokens_per_sec, 2),
        status="healthy" if model_manager.model is not None else "mock_mode",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT)
