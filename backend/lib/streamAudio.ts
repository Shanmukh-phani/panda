import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';

const SONGS_DIR = path.resolve(__dirname, '..', 'songs');
const MAX_STREAMS = Number(process.env.MAX_AUDIO_STREAMS || 1200);
let activeStreams = 0;

export const streamStats = () => ({ active: activeStreams, max: MAX_STREAMS });

const safeFile = (raw: string) => {
  let decoded = String(raw || '');
  try {
    decoded = decodeURIComponent(decoded);
  } catch {}
  const file = path.basename(decoded);
  if (!file || file.includes('..') || !/\.mp3$/i.test(file)) return null;
  const full = path.resolve(SONGS_DIR, file);
  if (!full.startsWith(SONGS_DIR + path.sep) && full !== SONGS_DIR) return null;
  return { file, full };
};

export const streamAudio = (req: Request, res: Response) => {
  const parsed = safeFile(req.params.file);
  if (!parsed) {
    res.status(400).json({ message: 'Invalid audio file' });
    return;
  }
  if (!fs.existsSync(parsed.full)) {
    res.status(404).json({ message: 'Audio not found' });
    return;
  }

  if (process.env.NGINX_ACCEL === '1') {
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('X-Accel-Redirect', `/internal-audio/${encodeURIComponent(parsed.file)}`);
    res.status(200).end();
    return;
  }

  if (activeStreams >= MAX_STREAMS) {
    res.setHeader('Retry-After', '2');
    res.status(503).json({ message: 'Streaming is busy. Retry in a moment.' });
    return;
  }

  const stat = fs.statSync(parsed.full);
  const range = String(req.headers.range || '');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Content-Disposition', `inline; filename="${parsed.file.replace(/"/g, '')}"`);

  const release = () => {
    activeStreams = Math.max(0, activeStreams - 1);
  };

  const pipeFile = (start: number, end: number, status: number) => {
    activeStreams += 1;
    res.status(status);
    res.setHeader('Content-Length', String(end - start + 1));
    if (status === 206) {
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    }
    const stream = fs.createReadStream(parsed.full, { start, end, highWaterMark: 64 * 1024 });
    const done = () => {
      stream.destroy();
      release();
    };
    res.on('close', done);
    stream.on('error', done);
    stream.pipe(res);
  };

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    let start = match && match[1] ? Number(match[1]) : 0;
    let end = match && match[2] ? Number(match[2]) : stat.size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= stat.size) {
      res.setHeader('Content-Range', `bytes */${stat.size}`);
      res.status(416).end();
      return;
    }
    end = Math.min(end, stat.size - 1);
    pipeFile(start, end, 206);
    return;
  }

  pipeFile(0, stat.size - 1, 200);
};
