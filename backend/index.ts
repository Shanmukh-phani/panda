import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import songRoutes from './routes/songRoutes';
import { refreshSongMetadata } from './lib/refreshSongs';
import { streamAudio, streamStats } from './lib/streamAudio';
import { rateLimit } from './lib/rateLimit';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3005);

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '32kb' }));
app.use('/api', rateLimit(60_000, Number(process.env.API_RATE_LIMIT || 180)));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'panda-api',
    mongo: mongoose.connection.readyState === 1,
    streams: streamStats(),
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'panda-api', mongo: mongoose.connection.readyState === 1, streams: streamStats() });
});

app.use('/api/songs', songRoutes);
app.get('/songs/:file', streamAudio);

app.get('/join/:code', (req, res) => {
  const code = String(req.params.code || '').replace(/\D/g, '').slice(0, 6);
  const deep = `panda://join/${code}`;
  res.type('html').send(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Join Panda ${code}</title>
<style>body{font-family:-apple-system,sans-serif;background:#080809;color:#F4F3EF;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}main{text-align:center;padding:24px}h1{letter-spacing:6px;font-size:40px}a{color:#C9A36A}</style>
</head><body><main>
<p>Join this Panda session</p>
<h1>${code || '------'}</h1>
<p><a href="${deep}">Open in Panda</a></p>
<p>Or type this code in Group → Join</p>
</main><script>if (${code.length === 6 ? 'true' : 'false'}) { window.location = '${deep}'; }</script>
</body></html>`);
});

mongoose
  .connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/syncmusicplayer', {
    maxPoolSize: 20,
    minPoolSize: 2,
  })
  .then(() => {
    console.log('Connected to MongoDB');
    if (process.env.REFRESH_ON_BOOT === '1') {
      refreshSongMetadata()
        .then(result => console.log(`Refreshed metadata for ${result.updated} songs`))
        .catch(err => console.log('Metadata refresh skipped', err));
    }
    const server = app.listen(PORT, () => {
      console.log(`Backend Server is running on port ${PORT}`);
    });
    server.keepAliveTimeout = 65_000;
    server.headersTimeout = 66_000;
    server.maxHeadersCount = 32;
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB', err);
  });
