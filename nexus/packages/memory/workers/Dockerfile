FROM python:3.11-slim

WORKDIR /app

COPY packages/memory/workers/pyproject.toml .
RUN pip install --no-cache-dir .

COPY packages/memory/workers/ .

EXPOSE 8001
CMD ["uvicorn", "compaction_daemon:app", "--host", "0.0.0.0", "--port", "8001"]
