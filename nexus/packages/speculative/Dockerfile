FROM python:3.11-slim

WORKDIR /app

COPY packages/speculative/pyproject.toml .
RUN pip install --no-cache-dir .

COPY packages/speculative/ .

EXPOSE 8002
CMD ["uvicorn", "aurora_controller:app", "--host", "0.0.0.0", "--port", "8002"]
