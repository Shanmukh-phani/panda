import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  email: string;
  name: string;
  data: Record<string, unknown>;
  lastLoginAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    name: { type: String, default: '', trim: true },
    data: { type: Schema.Types.Mixed, default: {} },
    lastLoginAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export default mongoose.model<IUser>('User', UserSchema);
