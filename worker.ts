import serverless from 'serverless-http';
import { app, initSQLiteState } from './server';

let dbInitialized = false;
const handler = serverless(app);

export default {
  async fetch(request: Request, env: any, ctx: any) {
    if (env) {
      for (const [key, val] of Object.entries(env)) {
        if (typeof val === 'string' && val) {
          process.env[key] = val;
        }
      }
    }

    if (!dbInitialized) {
      try {
        await initSQLiteState();
        dbInitialized = true;
      } catch (e) {
        console.error('Failed to initialize SQLite/Turso DB state:', e);
      }
    }

    const url = new URL(request.url);

    // Routes starting with /api go to Express backend
    if (url.pathname.startsWith('/api')) {
      return handler(request, ctx);
    }

    // Serve static frontend assets from Cloudflare Workers Assets binding
    if (env.ASSETS) {
      const res = await env.ASSETS.fetch(request);
      if (res.status !== 404) {
        return res;
      }
      // SPA Fallback for client-side routing
      const indexRequest = new Request(new URL('/index.html', request.url), request);
      return env.ASSETS.fetch(indexRequest);
    }

    return handler(request, ctx);
  }
};
