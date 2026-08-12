FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci || npm install

COPY . .
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV SERVER_PORT=4344

COPY package*.json ./
RUN npm ci --only=production || npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/index.html ./index.html
COPY --from=builder /app/openapi.yaml ./openapi.yaml

RUN mkdir -p /app/data

EXPOSE 4344 3000

CMD ["npm", "start"]

