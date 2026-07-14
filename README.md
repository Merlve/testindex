# Shutter

A modern OpenList client.

## Deployment

The application uses `SERVER_PORT` for the backend. By default, it runs on port 3000.

### 1. Docker Compose (Recommended)
You can deploy this on your VPS using Docker Compose. It maps the container's internal port to port 8700 on your host.

Create a `docker-compose.yml`:
```yaml
version: '3.8'
services:
  shutter:
    build: .
    ports:
      - "8700:3000"
    environment:
      - NODE_ENV=production
      - SERVER_PORT=3000
    restart: always
```

Run with:
```bash
docker-compose up -d
```

### 2. NodeJS on a VPS
To run it directly via Node on your VPS:

```bash
# Install dependencies
npm install

# Build the application
npm run build

# Start the application on port 8700
SERVER_PORT=8700 npm run start
```

### 3. Vercel
Vercel is primarily serverless, but this app uses a custom Express server (`server.ts`). To deploy to Vercel, you would typically need to split the backend into Vercel Serverless Functions (`api/` folder) and deploy the frontend as a Vite SPA. Since this uses a full-stack Express server, deploying to **Render**, **Railway**, or a VPS (as shown above) is heavily recommended over Vercel.
