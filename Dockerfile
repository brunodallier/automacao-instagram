# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --ignore-scripts && node node_modules/@prisma/engines/scripts/postinstall.js

FROM dependencies AS builder
COPY . .
ENV PULSO_STANDALONE=1 NODE_OPTIONS=--max-old-space-size=2048
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
RUN groupadd --gid 10001 pulso && useradd --uid 10001 --gid pulso --no-create-home pulso
COPY --from=builder --chown=pulso:pulso /app/.next/standalone ./
COPY --from=builder --chown=pulso:pulso /app/.next/static ./.next/static
COPY --chown=pulso:pulso ops/runtime ./ops/runtime
USER pulso
ENTRYPOINT ["node", "ops/runtime/entrypoint.mjs"]
CMD ["node", "server.js"]
EXPOSE 3000

FROM dependencies AS tools
COPY tsconfig.json prisma.config.ts ./
COPY scripts ./scripts
COPY src/lib ./src/lib
COPY --from=builder /app/src/generated ./src/generated
COPY ops/runtime ./ops/runtime
RUN groupadd --gid 10001 pulso && useradd --uid 10001 --gid pulso --no-create-home pulso
USER pulso
ENTRYPOINT ["node", "ops/runtime/entrypoint.mjs"]
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]
