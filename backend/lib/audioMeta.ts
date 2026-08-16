import fs from 'fs';
import path from 'path';

export type AudioMeta = {
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  duration: number;
};

const synchsafe = (buf: Buffer, offset: number) =>
  (buf[offset] & 0x7f) * 0x200000 + (buf[offset + 1] & 0x7f) * 0x4000 + (buf[offset + 2] & 0x7f) * 0x80 + (buf[offset + 3] & 0x7f);

const decodeId3Text = (buf: Buffer) => {
  if (!buf.length) return '';
  const encoding = buf[0];
  const body = buf.subarray(1);
  try {
    if (encoding === 0) return body.toString('latin1').replace(/\0/g, '').trim();
    if (encoding === 3) return body.toString('utf8').replace(/\0/g, '').trim();
    if (encoding === 1 || encoding === 2) {
      const start = body[0] === 0xff && body[1] === 0xfe ? 2 : body[0] === 0xfe && body[1] === 0xff ? 2 : 0;
      return body.subarray(start).toString('utf16le').replace(/\0/g, '').trim();
    }
  } catch {
    return body.toString('utf8').replace(/\0/g, '').trim();
  }
  return body.toString('utf8').replace(/\0/g, '').trim();
};

const tidy = (value: string) => value.replace(/\s+/g, ' ').trim();

export const cleanTrackName = (file: string) => {
  const cleaned = tidy(
    file
      .replace(/\.mp3$/i, '')
      .replace(/_+\d+\s*$/g, '')
      .replace(/[_]+/g, ' ')
      .replace(/\s*[-–]?\s*\(?\s*sensongsm?p3(?:\.(?:com|co))?\s*\)?/gi, ' ')
      .replace(/\s*[-–]?\s*naasongs\s*/gi, ' ')
      .replace(/\s*\(\s*\)/g, '')
      .replace(/\s*\(\d+\)\s*$/g, ''),
  );
  const withoutTrack = tidy(cleaned.replace(/^\d{1,2}\s*[-.)]\s*/g, '').replace(/^\d{1,2}-+\s*/, ''));
  const parts = withoutTrack.split(/\s+[-–]\s+/).map(part => tidy(part)).filter(Boolean);
  if (parts.length >= 2 && parts[0] && !/^\d+$/.test(parts[0])) {
    return { artist: parts[0], title: parts.slice(1).join(' - ') || withoutTrack };
  }
  const title = tidy(withoutTrack.replace(/[-–]+/g, ' '));
  return { artist: 'Unknown Artist', title: title || file.replace(/\.mp3$/i, '') };
};

const parseId3 = (buf: Buffer) => {
  const meta: Partial<AudioMeta> = {};
  if (buf.length < 10 || buf.subarray(0, 3).toString('ascii') !== 'ID3') return meta;
  const version = buf[3];
  const tagSize = synchsafe(buf, 6);
  let offset = 10;
  const end = Math.min(buf.length, 10 + tagSize);
  while (offset + 10 < end) {
    const id = buf.subarray(offset, offset + 4).toString('ascii');
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const size = version === 4 ? synchsafe(buf, offset + 4) : buf.readUInt32BE(offset + 4);
    if (size <= 0 || offset + 10 + size > buf.length) break;
    const value = decodeId3Text(buf.subarray(offset + 10, offset + 10 + size));
    if (id === 'TIT2' && value) meta.title = value;
    if (id === 'TPE1' && value) meta.artist = value;
    if (id === 'TALB' && value) meta.album = value;
    if (id === 'TCON' && value) meta.genre = value.replace(/^\(\d+\)/, '').trim();
    offset += 10 + size;
  }
  return meta;
};

const BITRATES = [
  [0, 0, 0, 0, 0],
  [32, 32, 32, 32, 8],
  [40, 48, 48, 48, 16],
  [48, 56, 56, 56, 24],
  [56, 64, 64, 64, 32],
  [64, 80, 80, 80, 40],
  [80, 96, 96, 96, 48],
  [96, 112, 112, 112, 56],
  [112, 128, 128, 128, 64],
  [128, 160, 160, 160, 80],
  [160, 192, 192, 192, 96],
  [192, 224, 224, 224, 112],
  [224, 256, 256, 256, 128],
  [256, 320, 320, 320, 144],
  [320, 384, 384, 384, 160],
];

const estimateDuration = (buf: Buffer, fileSize: number) => {
  for (let i = 0; i < Math.min(buf.length - 4, 4096); i += 1) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) continue;
    const bitrateIndex = (buf[i + 2] >> 4) & 0x0f;
    if (bitrateIndex === 0 || bitrateIndex === 15) continue;
    const bitrate = (BITRATES[bitrateIndex]?.[1] || 128) * 1000;
    const seconds = Math.round((fileSize * 8) / bitrate);
    if (seconds > 20 && seconds < 60 * 30) return seconds;
  }
  return Math.max(90, Math.round(fileSize / 16000));
};

export const readAudioMeta = (filePath: string): AudioMeta => {
  const file = path.basename(filePath);
  const fromName = cleanTrackName(file);
  const stat = fs.statSync(filePath);
  const fd = fs.openSync(filePath, 'r');
  const head = Buffer.alloc(Math.min(stat.size, 128 * 1024));
  fs.readSync(fd, head, 0, head.length, 0);
  fs.closeSync(fd);
  const tags = parseId3(head);
  return {
    title: tags.title || fromName.title,
    artist: tags.artist || fromName.artist,
    album: tags.album,
    genre: tags.genre,
    duration: estimateDuration(head, stat.size),
  };
};
