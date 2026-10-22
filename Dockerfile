# syntax=docker/dockerfile:1.7
#
# One image, three jobs: the dashboard (default), the engine CLI, and the demo shop.
#   docker run -p 3300:3000 nightqa                        dashboard
#   docker run nightqa node dist/src/cli.js run ...         engine CLI
#   docker run nightqa node dist/zoo/server.js              demo shop
#
# Slim Node base plus Chromium's headless shell only (no Firefox or WebKit). The browser is installed by the same
# Playwright version the app depends on, so the two can never drift apart.
FROM node:24-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# ---- engine dependencies (all, for the build) -------------------------------------------------------------
FROM base AS deps-root
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    NODE_ENV=development pnpm install --frozen-lockfile

# ---- dashboard dependencies (all, for the build) ----------------------------------------------------------
FROM base AS deps-web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm NODE_ENV=development npm ci

# ---- build: compile the engine and the demo shop, then build the dashboard ---------------------------------
FROM base AS build
COPY --from=deps-root /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY zoo ./zoo
RUN pnpm build
WORKDIR /app/web
COPY --from=deps-web /app/web/node_modules ./node_modules
COPY web/package.json web/package-lock.json web/next.config.ts web/tsconfig.json ./
COPY web/src ./src
COPY web/public ./public
RUN npm run build

# ---- production dependencies only -------------------------------------------------------------------------
FROM base AS prod-root
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --prod

FROM base AS prod-web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# ---- runtime ----------------------------------------------------------------------------------------------
FROM base AS runtime
LABEL org.opencontainers.image.title="NightQA" \
      org.opencontainers.image.description="Self-healing QA agent for AI-written software" \
      org.opencontainers.image.source="https://github.com/OWNER/nightqa"
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NIGHTQA_REPO_ROOT=/app \
    NIGHTQA_ENGINE=dist \
    NIGHTQA_RESULTS_DIR=/app/results \
    NIGHTQA_TESTS_DIR=/app/tests/nightqa \
    HOME=/tmp \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=prod-root /app/node_modules ./node_modules
# Chromium headless shell and the system libraries it needs, from the Playwright version in node_modules.
RUN node node_modules/playwright/cli.js install --with-deps --only-shell chromium \
    && rm -rf /var/lib/apt/lists/* /root/.cache \
    && chmod -R a+rX /ms-playwright
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY flows ./flows
COPY --from=prod-web /app/web/node_modules ./web/node_modules
COPY --from=build /app/web/.next ./web/.next
COPY --from=build /app/web/public ./web/public
COPY web/package.json web/next.config.ts ./web/
# Writable by any uid so docker compose can run the container as your own user (NIGHTQA_UID).
RUN mkdir -p /app/results /app/tests/nightqa /app/data /app/web/.next/cache \
    && chmod -R a+rwX /app/results /app/tests /app/data /app/flows /app/web/.next/cache
USER node
WORKDIR /app/web
EXPOSE 3000 4010
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
