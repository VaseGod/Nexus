FROM python:3.11-slim

WORKDIR /app

COPY packages/edge/pyproject.toml .
RUN pip install --no-cache-dir .

COPY packages/edge/ .

EXPOSE 8003
CMD ["uvicorn", "local_server:app", "--host", "0.0.0.0", "--port", "8003"]
