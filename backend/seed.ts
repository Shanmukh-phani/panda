import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import Song from './models/Song';

dotenv.config();

const BASE_URL = process.env.BASE_URL || 'https://api.re4g.in';

// Helper to pick random album art for dynamically added songs
const coverArts = [
  'https://images.unsplash.com/photo-1614680376593-902f74cf0d41?q=80&w=1000&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=1000&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=1000&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1493225457124-a1a2a5956093?q=80&w=1000&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1000&auto=format&fit=crop'
];

const songsDir = path.join(__dirname, 'songs');

mongoose
  .connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/syncmusicplayer')
  .then(async () => {
    console.log('Connected to MongoDB for seeding');
    
    // 1. Read all files in the backend/songs/ directory
    const files = fs.readdirSync(songsDir).filter(file => file.endsWith('.mp3'));
    
    if (files.length === 0) {
      console.log('No .mp3 files found in the songs directory.');
      process.exit(0);
    }

    // 2. Map files to MongoDB documents
    const songs = files.map(file => {
      // Just use the raw filename as the title
      const title = file.replace('.mp3', '').trim();
      const artist = 'Unknown Artist';

      const randomArt = coverArts[Math.floor(Math.random() * coverArts.length)];

      return {
        title: title,
        artist: artist,
        duration: Math.floor(Math.random() * (240 - 120 + 1) + 120), // random duration 2-4 mins
        audioUrl: `${BASE_URL}/songs/${encodeURIComponent(file)}`,
        albumArtUrl: randomArt,
      };
    });

    // 3. Clear old database and insert new songs
    await Song.deleteMany({});
    console.log('Cleared existing songs');
    
    await Song.insertMany(songs);
    console.log(`Successfully seeded database with ${songs.length} songs!`);
    
    mongoose.connection.close();
  })
  .catch((err) => {
    console.error('Seed error:', err);
  });
