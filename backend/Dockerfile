FROM python:3.12-slim

WORKDIR /app

# Install dependencies first (better layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

ENV PYTHONUNBUFFERED=1
ENV PORT=8000

EXPOSE 8000

# OCPP WebSocket is served at /ocpp/{charge_point_id} on the same port
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
