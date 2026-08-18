import User from '../models/User';
import { normalizeEmail } from './otpAuth';

export const findOrCreateUser = async (email: string) => {
  const id = normalizeEmail(email);
  const user = await User.findOneAndUpdate(
    { email: id },
    {
      $set: { lastLoginAt: new Date() },
      $setOnInsert: { email: id, name: '', data: {} },
    },
    { upsert: true, new: true },
  );
  return user;
};

export const setUserName = async (email: string, name: string) => {
  const clean = String(name || '').trim().slice(0, 40);
  if (clean.length < 2) return null;
  const user = await User.findOneAndUpdate(
    { email: normalizeEmail(email) },
    { $set: { name: clean } },
    { new: true },
  );
  return user;
};

export const getUserByEmail = (email: string) => User.findOne({ email: normalizeEmail(email) });

export const saveUserData = async (email: string, data: Record<string, unknown>) => {
  const user = await User.findOneAndUpdate(
    { email: normalizeEmail(email) },
    { $set: { data: data && typeof data === 'object' ? data : {} } },
    { new: true },
  );
  return user;
};
