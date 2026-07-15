import { Request, Response } from 'express';
import Song from '../models/Song';

export const getSongs = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 15;
    const skip = (page - 1) * limit;

    const songs = await Song.find().skip(skip).limit(limit);
    const total = await Song.countDocuments();

    res.status(200).json({
      songs,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching songs', error });
  }
};

export const createSong = async (req: Request, res: Response) => {
  try {
    const { title, artist, duration, albumArtUrl, audioUrl } = req.body;
    const newSong = new Song({ title, artist, duration, albumArtUrl, audioUrl });
    const savedSong = await newSong.save();
    res.status(201).json(savedSong);
  } catch (error) {
    res.status(500).json({ message: 'Error creating song', error });
  }
};
