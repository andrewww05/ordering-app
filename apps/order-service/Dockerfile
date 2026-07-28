FROM node:24-alpine AS builder
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    pnpm exec nx build order-service

FROM node:24-alpine AS runner
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
COPY --from=builder /workspace/dist/apps/order-service/package.json ./package.json
RUN pnpm install --prod --no-frozen-lockfile && pnpm store prune
COPY --from=builder /workspace/dist/apps/order-service ./
USER node
EXPOSE 3001
CMD ["node", "main.js"]
