import crypto from 'crypto';
import { mailConfigured, sendOtpMail } from './mail';

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_MS = 45 * 1000;
const MAX_SENDS = 5;
const MAX_TRIES = 6;

type OtpRecord = {
  hash: string;
  expires: number;
  sentAt: number;
  sends: number;
  tries: number;
};

const otps = new Map<string, OtpRecord>();

const prune = (now: number) => {
  if (otps.size < 2000) return;
  Array.from(otps.entries()).forEach(([email, row]) => {
    if (row.expires < now) otps.delete(email);
  });
};

export const normalizeEmail = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase();

export const isGmail = (email: string) =>
  /^[a-z0-9.'_%+-]+@(gmail|googlemail)\.com$/.test(email);

const hashOtp = (email: string, code: string) =>
  crypto.createHmac('sha256', process.env.AUTH_SECRET || 'panda-otp').update(`${email}:${code}`).digest('hex');

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

export const requestOtp = async (rawEmail: string) => {
  const email = normalizeEmail(rawEmail);
  if (!isGmail(email)) {
    return { ok: false as const, status: 400, message: 'Enter a Gmail address.' };
  }

  const now = Date.now();
  prune(now);
  const existing = otps.get(email);
  if (existing && now - existing.sentAt < RESEND_MS) {
    const wait = Math.ceil((RESEND_MS - (now - existing.sentAt)) / 1000);
    return { ok: false as const, status: 429, message: `Wait ${wait}s before requesting another code.` };
  }
  if (existing && existing.sends >= MAX_SENDS && existing.expires > now) {
    return { ok: false as const, status: 429, message: 'Too many codes for this Gmail. Try again later.' };
  }

  const code = String(crypto.randomInt(100000, 1000000));
  otps.set(email, {
    hash: hashOtp(email, code),
    expires: now + OTP_TTL_MS,
    sentAt: now,
    sends: (existing?.sends || 0) + 1,
    tries: 0,
  });

  const echo = process.env.AUTH_DEV_ECHO === '1';
  if (mailConfigured()) {
    try {
      await sendOtpMail(email, code);
    } catch (error) {
      otps.delete(email);
      console.error('OTP mail failed', error);
      return { ok: false as const, status: 502, message: 'Could not send the Gmail code. Try again.' };
    }
  } else if (!echo) {
    otps.delete(email);
    return {
      ok: false as const,
      status: 503,
      message: 'Email sending is not set up yet. Add SMTP_USER and SMTP_PASS on the server.',
    };
  } else {
    console.log(`[auth] OTP for ${email}: ${code}`);
  }

  return {
    ok: true as const,
    email,
    wait: Math.ceil(RESEND_MS / 1000),
    previewOtp: echo ? code : undefined,
  };
};

export const verifyOtp = async (rawEmail: string, rawCode: string) => {
  const email = normalizeEmail(rawEmail);
  const code = String(rawCode || '').replace(/\D/g, '').slice(0, 6);
  if (!isGmail(email) || code.length !== 6) {
    return { ok: false as const, status: 400, message: 'Enter the 6-digit code from your Gmail.' };
  }

  const now = Date.now();
  const row = otps.get(email);
  if (!row || row.expires < now) {
    return { ok: false as const, status: 400, message: 'Code expired. Request a new one.' };
  }
  row.tries += 1;
  if (row.tries > MAX_TRIES) {
    otps.delete(email);
    return { ok: false as const, status: 429, message: 'Too many tries. Request a new code.' };
  }
  if (!safeEqual(row.hash, hashOtp(email, code))) {
    return { ok: false as const, status: 400, message: 'That code is not correct.' };
  }

  otps.delete(email);
  const { findOrCreateUser } = await import('./userAccount');
  const user = await findOrCreateUser(email);
  const name = String(user.name || '').trim();
  const token = signSession(email);
  return { ok: true as const, email, name, isNew: !name, token };
};

export const signSession = (email: string) => {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 30;
  const payload = `${email}|${exp}`;
  const sig = crypto.createHmac('sha256', process.env.AUTH_SECRET || 'panda-otp').update(payload).digest('hex');
  return Buffer.from(`${payload}|${sig}`).toString('base64url');
};

export const readSession = (token: string) => {
  try {
    const raw = Buffer.from(String(token || ''), 'base64url').toString('utf8');
    const [email, exp, sig] = raw.split('|');
    if (!email || !exp || !sig) return null;
    const expected = crypto.createHmac('sha256', process.env.AUTH_SECRET || 'panda-otp').update(`${email}|${exp}`).digest('hex');
    if (!safeEqual(expected, sig)) return null;
    if (Number(exp) < Date.now()) return null;
    if (!isGmail(email)) return null;
    return { email };
  } catch {
    return null;
  }
};
