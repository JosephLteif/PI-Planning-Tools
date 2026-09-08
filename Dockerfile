FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

RUN npm run build:all

FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    POINTLINE_DB_PATH=/data/pointline.sqlite

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build --chown=node:node /app/frontend/dist ./frontend/dist
COPY --from=build --chown=node:node /app/server/index.js ./server/index.js
COPY --from=build --chown=node:node /app/server/routes ./server/routes
COPY --from=build --chown=node:node /app/server/services ./server/services
COPY --from=build --chown=node:node /app/server/database.mjs ./server/database.mjs
COPY --from=build --chown=node:node /app/server/node-server.mjs ./server/node-server.mjs
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/drizzle-postgres ./drizzle-postgres
RUN mkdir -p /data && chown node:node /data

USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:8787/healthz').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/node-server.mjs"]
