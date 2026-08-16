import { Request, Response } from 'express';
import Song from '../models/Song';
import { refreshSongMetadata } from '../lib/refreshSongs';
import { cleanTrackName } from '../lib/audioMeta';
import { cacheClear, cacheGet, cacheSet } from '../lib/cache';
import { rankSongs } from '../lib/searchRank';

const AUDIO_PUBLIC_BASE = String(process.env.AUDIO_PUBLIC_BASE || '').replace(/\/$/, '');
const CATALOG_TTL = Number(process.env.CATALOG_CACHE_MS || 30000);

const rewriteAudio = (url?: string) => {
  if (!AUDIO_PUBLIC_BASE || !url) return url;
  try {
    const parsed = new URL(url);
    return `${AUDIO_PUBLIC_BASE}${parsed.pathname}`;
  } catch {
    return url;
  }
};

const presentSong = (song: any) => {
  const raw = song.toObject ? song.toObject() : song;
  const artistMissing = !raw.artist || /^(unknown artist|unknown|\d+)$/i.test(raw.artist);
  const parsed = cleanTrackName(raw.title || '');
  return {
    ...raw,
    title: parsed.title || raw.title,
    artist: artistMissing ? parsed.artist || 'Unknown Artist' : raw.artist,
    audioUrl: rewriteAudio(raw.audioUrl) || raw.audioUrl,
  };
};

const loadCatalog = async () => {
  const cached = cacheGet<any[]>('catalog');
  if (cached) return cached;
  const songs = await Song.find({}).lean().limit(2500);
  const presented = songs.map(presentSong);
  cacheSet('catalog', presented, CATALOG_TTL);
  return presented;
};

export const getSongs = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(80, Math.max(1, parseInt(String(req.query.limit), 10) || 15));
    const skip = (page - 1) * limit;
    const q = String(req.query.q || '').trim().slice(0, 80);
    const artist = String(req.query.artist || '').trim().slice(0, 80);
    const album = String(req.query.album || '').trim().slice(0, 80);
    const genre = String(req.query.genre || '').trim().slice(0, 40);

    let songs = await loadCatalog();
    if (artist) songs = songs.filter(song => String(song.artist || '').toLowerCase() === artist.toLowerCase());
    if (album) songs = songs.filter(song => String(song.album || '').toLowerCase() === album.toLowerCase());
    if (genre) songs = songs.filter(song => String(song.genre || '').toLowerCase().includes(genre.toLowerCase()));
    if (q) songs = rankSongs(songs, q);

    const total = songs.length;
    const pageSongs = songs.slice(skip, skip + limit);

    res.setHeader('Cache-Control', q ? 'private, max-age=15' : 'public, max-age=20');
    res.status(200).json({
      songs: pageSongs,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      currentPage: page,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching songs' });
  }
};

export const getSongMeta = async (_req: Request, res: Response) => {
  try {
    const cached = cacheGet<{ artists: string[]; albums: string[]; genres: string[] }>('meta');
    if (cached) {
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.status(200).json(cached);
      return;
    }
    const songs = await loadCatalog();
    const artists = Array.from(new Set(songs.map(song => song.artist).filter(Boolean)));
    const albums = Array.from(new Set(songs.map(song => song.album).filter(Boolean)));
    const genres = Array.from(new Set(songs.map(song => song.genre).filter(Boolean)));
    const payload = { artists, albums, genres };
    cacheSet('meta', payload, 60000);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).json(payload);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching song meta' });
  }
};

export const getSongById = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '');
    if (!/^[a-f0-9]{24}$/i.test(id)) {
      res.status(400).json({ message: 'Invalid song id' });
      return;
    }
    const catalog = await loadCatalog();
    const fromCache = catalog.find(song => String(song._id) === id);
    if (fromCache) {
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.status(200).json(fromCache);
      return;
    }
    const song = await Song.findById(id).lean();
    if (!song) {
      res.status(404).json({ message: 'Song not found' });
      return;
    }
    res.status(200).json(presentSong(song));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching song' });
  }
};

export const refreshSongs = async (_req: Request, res: Response) => {
  try {
    const result = await refreshSongMetadata();
    cacheClear();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error refreshing song metadata' });
  }
};

export const createSong = async (req: Request, res: Response) => {
  try {
    const { title, artist, duration, albumArtUrl, audioUrl, album, genre, lyrics } = req.body || {};
    if (!title || !artist || !audioUrl || !Number.isFinite(Number(duration))) {
      res.status(400).json({ message: 'title, artist, duration, and audioUrl are required' });
      return;
    }
    const newSong = new Song({
      title: String(title).slice(0, 200),
      artist: String(artist).slice(0, 120),
      duration: Number(duration),
      albumArtUrl,
      audioUrl: String(audioUrl).slice(0, 500),
      album,
      genre,
      lyrics,
    });
    const savedSong = await newSong.save();
    cacheClear();
    res.status(201).json(savedSong);
  } catch (error) {
    res.status(500).json({ message: 'Error creating song' });
  }
};
