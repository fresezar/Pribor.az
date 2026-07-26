# Pribor API (NestJS) — monorepo-farkında çok aşamalı imaj.
# Build bağlamı DEPO KÖKÜ olmalı:  docker build -f apps/api/Dockerfile .
FROM node:20-slim AS base
RUN corepack enable
WORKDIR /repo

# --- deps: sadece manifest'ler → katman cache'i bağımlılıklarda kalsın ---
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

# --- build: kaynak + derleme ---
FROM base AS build
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=deps /repo/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN pnpm --filter @pribor/contracts build \
 && pnpm --filter @pribor/db build \
 && pnpm --filter @pribor/api build \
 && pnpm --filter @pribor/api --prod --legacy deploy /out

# --- runner: yalın çalışma imajı ---
FROM node:20-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
# Drizzle migration'ları imaja dahil (giriş noktasında uygulanabilir)
COPY --from=build /repo/packages/db/migrations ./packages/db/migrations
EXPOSE 3001
CMD ["node", "dist/main.js"]
