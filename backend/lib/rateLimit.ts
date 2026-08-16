import { Request, Response, NextFunction } from 'express';

type Bucket = { count: number; reset: number };

const buckets = new Map<string, Bucket>();

const prune = (now: number) => {
  if (buckets.size < 4000) return;
  Array.from(buckets.entries()).forEach(([key, bucket]) => {
    if (bucket.reset < now) buckets.delete(key);
  });
};

export const rateLimit = (windowMs: number, max: number) =>
  (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    prune(now);
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
      .split(',')[0]
      .trim();
    const key = `${ip}:${req.path}`;
    const current = buckets.get(key);
    if (!current || current.reset < now) {
      buckets.set(key, { count: 1, reset: now + windowMs });
      next();
      return;
    }
    current.count += 1;
    if (current.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((current.reset - now) / 1000)));
      res.status(429).json({ message: 'Too many requests. Please wait a moment.' });
      return;
    }
    next();
  };
