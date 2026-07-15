import mongoose, { Document, Schema } from 'mongoose';

export interface ISong extends Document {
  title: string;
  artist: string;
  duration: number; // in seconds
  albumArtUrl?: string;
  audioUrl: string; // URL to the hosted audio file
}

const SongSchema: Schema = new Schema({
  title: { type: String, required: true },
  artist: { type: String, required: true },
  duration: { type: Number, required: true },
  albumArtUrl: { type: String },
  audioUrl: { type: String, required: true },
});

export default mongoose.model<ISong>('Song', SongSchema);
