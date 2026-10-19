# Build context is the repo root (see docker-compose.yml).
FROM node:20-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN npm install -w @driftboard/server

COPY packages/shared packages/shared
COPY apps/server apps/server
WORKDIR /app/apps/server
RUN npx prisma generate

EXPOSE 8787
# Create/refresh tables, seed (idempotent), start.
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx tsx src/seed.ts && npx tsx src/index.ts"]
