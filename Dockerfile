FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsup.config.ts ./
COPY src ./src
RUN pnpm build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM base AS runtime
ENV NODE_ENV=production DATA_DIR=/app/data
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# A named volume mounted here inherits this ownership, so the non-root user can write the database.
RUN mkdir -p /app/data && chown node:node /app/data
USER node
# Healthy while the scheduler keeps finishing its 60-second ticks (src/index.ts writes the heartbeat).
HEALTHCHECK --interval=60s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "const age = Date.now() - require('fs').statSync(process.env.DATA_DIR + '/heartbeat').mtimeMs; process.exit(age < 180000 ? 0 : 1)"
CMD ["node", "dist/index.js"]

