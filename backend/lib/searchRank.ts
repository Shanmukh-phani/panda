type SongLike = {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
};

const tokenize = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0c00-\u0c7f]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1);

export const rankSongs = <T extends SongLike>(songs: T[], query: string) => {
  const phrase = query.trim().toLowerCase();
  const tokens = tokenize(phrase);
  if (!tokens.length) return songs;
  return songs
    .map(song => {
      const title = String(song.title || '').toLowerCase();
      const artist = String(song.artist || '').toLowerCase();
      const album = String(song.album || '').toLowerCase();
      const genre = String(song.genre || '').toLowerCase();
      const hay = `${title} ${artist} ${album} ${genre}`;
      let score = 0;
      if (title.includes(phrase)) score += 12;
      if (artist.includes(phrase)) score += 10;
      tokens.forEach(token => {
        if (title === token) score += 8;
        else if (title.startsWith(token) || title.split(/\s+/).some(word => word.startsWith(token))) score += 4;
        else if (title.includes(token)) score += 3;
        if (artist.includes(token)) score += 3.5;
        if (album.includes(token) || genre.includes(token)) score += 1.2;
      });
      if (tokens.every(token => hay.includes(token))) score += 3;
      return { song, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.song);
};
