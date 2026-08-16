import mongoose, { Document, Schema } from 'mongoose';

export interface ISong extends Document {
  title: string;
  artist: string;
  duration: number; // in seconds
  albumArtUrl?: string;
  audioUrl: string; // URL to the hosted audio file
  album?: string;
  genre?: string;
  lyrics?: string;
}

const SongSchema: Schema = new Schema({
  title: { type: String, required: true },
  artist: { type: String, required: true },
  duration: { type: Number, required: true },
  albumArtUrl: { type: String },
  audioUrl: { type: String, required: true },
  album: { type: String },
  genre: { type: String },
  lyrics: { type: String },
});

SongSchema.index({ title: 1 });
SongSchema.index({ artist: 1 });
SongSchema.index({ album: 1 });
SongSchema.index({ audioUrl: 1 });

export default mongoose.model<ISong>('Song', SongSchema);
