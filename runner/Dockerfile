FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies if needed (none strictly required since server.js uses native http/https)
# RUN npm install --production

# Copy application files
COPY server.js ./
COPY public/ ./public/

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
