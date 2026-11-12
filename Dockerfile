# CryptoPayments — self-hosted API image (issue #6101).
#
# Multi-stage build. The repo's package manager is pnpm (CI uses pnpm 9 with
# pnpm-lock.yaml); the build stage installs all deps and compiles src/ to
# dist/, the runtime stage installs production deps only and runs the server.
# The repo's tsconfig.json is type-check-only (`noEmit: true`); the image
# build emits via tsconfig.build.json (same strictness, `noEmit: false`).
# NOTE: src imports use `.js` suffixes (not `.ts`) so the build config can
# compile without `allowImportingTsExtensions`, which TS5096 forbids with emit.
#
# Image tag: the commit SHA (pushed by .github/workflows/docker.yml). No
# `latest` tag is published — the AgentPod Deployment pins the exact SHA.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml tsconfig.json tsconfig.build.json ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec tsc -p tsconfig.build.json

FROM node:22-alpine AS runtime
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
ENV PORT=3003
EXPOSE 3003
CMD ["node", "dist/server.js"]
