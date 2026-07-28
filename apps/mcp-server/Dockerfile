FROM node:24-alpine AS builder
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec nx build mcp-server

FROM node:24-alpine AS runner
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
COPY --from=builder /workspace/dist/apps/mcp-server/package.json ./package.json
RUN pnpm install --prod --no-frozen-lockfile && pnpm store prune
COPY --from=builder /workspace/dist/apps/mcp-server ./
USER node
EXPOSE 3004
CMD ["node", "main.js"]
