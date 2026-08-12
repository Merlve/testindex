FROM node:22-bookworm AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci || npm install

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV SERVER_PORT=4344

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/index.html ./index.html
COPY --from=builder /app/openapi.yaml ./openapi.yaml

RUN mkdir -p /app/data

EXPOSE 4344 3000

CMD ["npm", "start"]

