import fs from 'fs';
import path from 'path';
import Song from '../models/Song';
import { readAudioMeta } from './audioMeta';

const BASE_URL = process.env.BASE_URL || 'https://api.re4g.in';

export const refreshSongMetadata = async () => {
  const songsDir = path.join(__dirname, '..', 'songs');
  if (!fs.existsSync(songsDir)) return { updated: 0 };
  const files = fs.readdirSync(songsDir).filter(file => file.endsWith('.mp3'));
  let updated = 0;
  for (const file of files) {
    const meta = readAudioMeta(path.join(songsDir, file));
    const audioUrl = `${BASE_URL}/songs/${encodeURIComponent(file)}`;
    const result = await Song.findOneAndUpdate(
      { audioUrl: { $regex: `${encodeURIComponent(file)}$` } },
      {
        $set: {
          title: meta.title,
          artist: meta.artist,
          duration: meta.duration,
          album: meta.album,
          genre: meta.genre,
          audioUrl,
        },
      },
    );
    if (result) updated += 1;
  }
  return { updated };
};
