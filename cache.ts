import { Request, Response, NextFunction } from 'express';

interface CacheEntry {
  data: any;
  expiry: number;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry>();
  private sweepInterval: NodeJS.Timeout;

  constructor() {
    this.sweepInterval = setInterval(() => this.sweep(), 60000);
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: any, ttlSeconds: number) {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlSeconds * 1000
    });
  }

  delete(key: string) {
    this.cache.delete(key);
  }

  private sweep() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }
}

export const apiCache = new MemoryCache();

export function cacheMiddleware(ttlSeconds: number, isPrivate: boolean = true) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET and POST
    if (req.method !== 'GET' && req.method !== 'POST') return next();

    // Do not cache if client explicitly asks for refresh
    if (req.body?.refresh === true || req.query?.refresh === 'true') {
      return next();
    }

    const token = req.headers.authorization || '';
    // Build a unique key: method + path + body stringified + (token if private)
    const keyPayload = {
      path: req.originalUrl,
      body: req.body
    };
    
    let key = `${req.method}_${JSON.stringify(keyPayload)}`;
    if (isPrivate) {
      key += `_${token}`;
    }

    const cachedData = apiCache.get(key);
    if (cachedData) {
      res.setHeader('Cache-Control', `${isPrivate ? 'private' : 'public'}, max-age=${ttlSeconds}`);
      return res.json(cachedData);
    }

    // Intercept res.json to cache the response before sending
    const originalJson = res.json.bind(res);
    res.json = ((body: any) => {
      // Cache only successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        apiCache.set(key, body, ttlSeconds);
        res.setHeader('Cache-Control', `${isPrivate ? 'private' : 'public'}, max-age=${ttlSeconds}`);
      }
      return originalJson(body);
    }) as any;

    next();
  };
}
