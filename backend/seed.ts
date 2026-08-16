import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import Song from './models/Song';
import { readAudioMeta } from './lib/audioMeta';

dotenv.config();

const BASE_URL = process.env.BASE_URL || 'https://api.re4g.in';

const coverArts = [
  'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1483412033650-1015ddeb83d1?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1459749411177-0421695288c7?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1465847898788-2787c8ac663e?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1446057032654-9d8885db76c6?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1498038432885-c6f3c0ea13cc?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1513829596324-4bb2800c5efb?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1485579141920-87c6924ce971?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1507838153414-b4b713384a76?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1460039236109-15399edb6276?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1458560871784-56d23406c091?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1487180144351-b8472da7d491?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1571330735066-03aaa9429d89?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1598387993441-a364f854c3e1?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1470229720293-7681489096d5?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1494232410401-ad00d5433cfa?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1471478331149-cbb564886959?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1487215078519-dc097fec00ca?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1598488035139-dd03540678bd?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1504898770365-2f27a81c1f95?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1501612780320-964022841eb9?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1415201364774-f220f38f960e?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1614149162880-b0d04ffb7eb9?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1533174072544-d04c39771bc2?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1619983081563-430f63602796?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1493223257756-a5c0133050f3?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1461784121038-f08857567d65?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1593697821020-89e95c7873c5?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1520969475093-2c8eab7aee8c?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1484588167172-404d481395c2?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1540039155994-d1296a6087d3?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1526328823543-30612e4e0cc0?auto=format&fit=crop&w=800&h=800&q=80',
  'https://images.unsplash.com/photo-1603048588665-791ca8aea497?auto=format&fit=crop&w=800&h=800&q=80',
];

const hashKey = (value: string) => {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (h << 5) - h + value.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
};

const songsDir = path.join(__dirname, 'songs');

mongoose
  .connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/syncmusicplayer')
  .then(async () => {
    console.log('Connected to MongoDB for seeding');

    const files = fs.readdirSync(songsDir).filter(file => file.endsWith('.mp3'));

    if (files.length === 0) {
      console.log('No .mp3 files found in the songs directory.');
      process.exit(0);
    }

    let updated = 0;
    for (const file of files) {
      const meta = readAudioMeta(path.join(songsDir, file));
      const audioUrl = `${BASE_URL}/songs/${encodeURIComponent(file)}`;
      const albumArtUrl = coverArts[hashKey(file) % coverArts.length];
      await Song.findOneAndUpdate(
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
          $setOnInsert: { albumArtUrl },
        },
        { upsert: true },
      );
      updated += 1;
    }
    console.log(`Updated catalog metadata for ${updated} songs.`);

    mongoose.connection.close();
  })
  .catch((err) => {
    console.error('Seed error:', err);
  });
