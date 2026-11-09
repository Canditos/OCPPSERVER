FROM node:20-alpine

WORKDIR /app

# Install Python, ca-certificates and edge-tts for RaquelNeural (Authentic Portugal European Portuguese Voice)
RUN apk add --no-cache python3 py3-pip ca-certificates && \
    pip install --no-cache-dir --break-system-packages edge-tts certifi

COPY package.json ./
COPY server.js tts_worker.py ./
COPY public/ ./public/

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
