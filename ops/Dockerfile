FROM node:24-bookworm-slim AS ui
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build
FROM node:24-bookworm-slim
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev && mkdir -p /data/images && chown node:node /data/images
COPY server/rules ./rules
COPY server/*.js server/*.sql ./
COPY --from=ui /web/dist ./public
USER node
CMD ["node", "start.js"]
