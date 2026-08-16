import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 8000,
  pingTimeout: 20000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
});

const PORT = process.env.PORT || 3006;
const LEAVE_GRACE_MS = 25000;
const MAX_ROOMS = Number(process.env.MAX_ROOMS || 400);
const MAX_ROOM_MEMBERS = Number(process.env.MAX_ROOM_MEMBERS || 50);
const MAX_QUEUE = Number(process.env.MAX_QUEUE || 80);
const DEBUG = process.env.DEBUG === '1';

type Member = {
  clientId: string;
  socketId: string;
  name: string;
  joinedAt: number;
  lastSeen: number;
  online: boolean;
};

type PlaybackState = {
  queue: unknown[];
  currentTrackIndex: number | null;
  position: number;
  isPlaying: boolean;
};

type NowPlaying = {
  id?: string;
  title?: string;
  artist?: string;
  albumArtUrl?: string;
  isPlaying?: boolean;
};

type RoomState = {
  hostClientId: string;
  members: Map<string, Member>;
  hostOnlyControls: boolean;
  lastState?: PlaybackState;
  nowPlaying?: NowPlaying;
};

const rooms = new Map<string, RoomState>();
const leaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

const timerKey = (roomId: string, clientId: string) => `${roomId}:${clientId}`;

const roomMembersPayload = (room: RoomState) =>
  Array.from(room.members.values())
    .sort((a, b) => {
      if (a.clientId === room.hostClientId) return -1;
      if (b.clientId === room.hostClientId) return 1;
      if (a.online !== b.online) return a.online ? -1 : 1;
      return a.joinedAt - b.joinedAt;
    })
    .map(member => ({
      id: member.clientId,
      socketId: member.socketId,
      name: member.name,
      isHost: member.clientId === room.hostClientId,
      online: member.online,
    }));

const emitRoomUpdate = (roomId: string) => {
  const room = rooms.get(roomId);
  if (!room) return;
  const payload = {
    roomId,
    members: roomMembersPayload(room),
    hostId: room.hostClientId,
    hostOnlyControls: room.hostOnlyControls,
    nowPlaying: room.nowPlaying || null,
  };
  io.to(roomId).emit('room-members', payload);
};

const memberBySocket = (room: RoomState, socketId: string) =>
  Array.from(room.members.values()).find(member => member.socketId === socketId);

const canControlRoom = (room: RoomState, socketId: string) => {
  if (!room.hostOnlyControls) return true;
  const member = memberBySocket(room, socketId);
  return !!member && member.clientId === room.hostClientId;
};

const promoteHostIfNeeded = (room: RoomState) => {
  const currentHost = room.members.get(room.hostClientId);
  if (currentHost?.online) return;
  const nextHost = Array.from(room.members.values()).find(member => member.online);
  if (nextHost) room.hostClientId = nextHost.clientId;
};

const removeMember = (roomId: string, clientId: string) => {
  const room = rooms.get(roomId);
  if (!room) return;
  room.members.delete(clientId);
  if (room.members.size === 0) {
    rooms.delete(roomId);
    return;
  }
  promoteHostIfNeeded(room);
  emitRoomUpdate(roomId);
};

const scheduleLeave = (roomId: string, clientId: string) => {
  const key = timerKey(roomId, clientId);
  const existing = leaveTimers.get(key);
  if (existing) clearTimeout(existing);
  leaveTimers.set(
    key,
    setTimeout(() => {
      leaveTimers.delete(key);
      removeMember(roomId, clientId);
    }, LEAVE_GRACE_MS),
  );
};

const cancelLeave = (roomId: string, clientId: string) => {
  const key = timerKey(roomId, clientId);
  const existing = leaveTimers.get(key);
  if (existing) {
    clearTimeout(existing);
    leaveTimers.delete(key);
  }
};

const leaveRoomNow = (socketId: string, roomId: string) => {
  const room = rooms.get(roomId);
  if (!room) return;
  const member = memberBySocket(room, socketId);
  if (!member) return;
  cancelLeave(roomId, member.clientId);
  removeMember(roomId, member.clientId);
};

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'panda-socket',
    rooms: rooms.size,
    listeners: Array.from(rooms.values()).reduce((sum, room) => sum + room.members.size, 0),
    maxRooms: MAX_ROOMS,
    maxRoomMembers: MAX_ROOM_MEMBERS,
  });
});

io.on('connection', socket => {
  if (DEBUG) console.log('User connected:', socket.id);

  socket.on(
    'join-room',
    (payload: string | { roomId: string; name?: string; clientId?: string; create?: boolean }) => {
      const roomId = typeof payload === 'string' ? payload : payload?.roomId;
      const name = (typeof payload === 'string' ? 'Panda' : payload?.name || 'Panda').trim().slice(0, 24) || 'Panda';
      const clientId = (typeof payload === 'string' ? socket.id : payload?.clientId || socket.id).trim();
      const allowCreate = typeof payload === 'string' ? true : payload?.create !== false;
      if (!roomId || !clientId) return;

      const previousRoomId = socket.data.roomId as string | undefined;
      if (previousRoomId && previousRoomId !== roomId) {
        socket.leave(previousRoomId);
        leaveRoomNow(socket.id, previousRoomId);
      }

      let room = rooms.get(roomId);
      if (!room) {
        if (!allowCreate) {
          socket.emit('join-error', { roomId, message: 'That room is not live. Check the code and try again.' });
          return;
        }
        if (rooms.size >= MAX_ROOMS) {
          socket.emit('join-error', { roomId, message: 'Panda rooms are full. Try again shortly.' });
          return;
        }
        room = {
          hostClientId: clientId,
          members: new Map(),
          hostOnlyControls: false,
        };
        rooms.set(roomId, room);
      }

      cancelLeave(roomId, clientId);
      if (!room.members.has(clientId) && room.members.size >= MAX_ROOM_MEMBERS) {
        socket.emit('join-error', { roomId, message: 'This room is full.' });
        return;
      }
      const existing = room.members.get(clientId);
      room.members.set(clientId, {
        clientId,
        socketId: socket.id,
        name,
        joinedAt: existing?.joinedAt || Date.now(),
        lastSeen: Date.now(),
        online: true,
      });
      promoteHostIfNeeded(room);

      socket.data.roomId = roomId;
      socket.data.clientId = clientId;
      socket.join(roomId);

      const joined = {
        roomId,
        selfId: clientId,
        members: roomMembersPayload(room),
        hostId: room.hostClientId,
        hostOnlyControls: room.hostOnlyControls,
        nowPlaying: room.nowPlaying || null,
      };
      socket.emit('joined-room', joined);
      emitRoomUpdate(roomId);

      if (room.lastState && room.hostClientId !== clientId) {
        socket.emit('sync-state', room.lastState);
      }

      if (DEBUG) console.log(`User ${socket.id} (${name}) joined room ${roomId}`);
    },
  );

  socket.on('leave-room', (roomId: string) => {
    if (!roomId) return;
    socket.leave(roomId);
    leaveRoomNow(socket.id, roomId);
    if (socket.data.roomId === roomId) {
      socket.data.roomId = undefined;
    }
  });

  socket.on('update-name', ({ roomId, name }: { roomId: string; name: string }) => {
    const room = rooms.get(roomId);
    if (!room || !name) return;
    const member = memberBySocket(room, socket.id);
    if (!member) return;
    member.name = name.trim().slice(0, 24) || member.name;
    member.lastSeen = Date.now();
    emitRoomUpdate(roomId);
  });

  socket.on('presence', ({ roomId }: { roomId: string }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const member = memberBySocket(room, socket.id);
    if (!member) return;
    member.lastSeen = Date.now();
    member.online = true;
  });

  socket.on('request-members', ({ roomId }: { roomId: string }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('join-error', { roomId, message: 'That room is no longer live.' });
      return;
    }
    socket.emit('room-members', {
      roomId,
      members: roomMembersPayload(room),
      hostId: room.hostClientId,
      hostOnlyControls: room.hostOnlyControls,
      nowPlaying: room.nowPlaying || null,
    });
  });

  socket.on('now-playing', (payload: NowPlaying & { roomId: string }) => {
    const room = rooms.get(payload.roomId);
    if (!room || !canControlRoom(room, socket.id)) return;
    room.nowPlaying = {
      id: payload.id,
      title: payload.title,
      artist: payload.artist,
      albumArtUrl: payload.albumArtUrl,
      isPlaying: payload.isPlaying,
    };
    io.to(payload.roomId).emit('now-playing', room.nowPlaying);
  });

  socket.on('room-settings', ({ roomId, hostOnlyControls }: { roomId: string; hostOnlyControls: boolean }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const member = memberBySocket(room, socket.id);
    if (!member || member.clientId !== room.hostClientId) return;
    room.hostOnlyControls = !!hostOnlyControls;
    emitRoomUpdate(roomId);
  });

  socket.on('transfer-host', ({ roomId, clientId }: { roomId: string; clientId: string }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const actor = memberBySocket(room, socket.id);
    const next = room.members.get(clientId);
    if (!actor || actor.clientId !== room.hostClientId || !next?.online) return;
    room.hostClientId = next.clientId;
    emitRoomUpdate(roomId);
  });

  socket.on('chat-message', ({ roomId, name, text }: { roomId: string; name: string; text: string }) => {
    if (!roomId || !text?.trim()) return;
    io.to(roomId).emit('chat-message', {
      id: `${Date.now()}-${socket.id}`,
      senderId: socket.data.clientId || socket.id,
      name: name || 'Panda',
      text: text.trim().slice(0, 280),
      at: Date.now(),
    });
  });

  socket.on('reaction', ({ roomId, emoji }: { roomId: string; emoji: string }) => {
    if (!roomId || !emoji) return;
    io.to(roomId).emit('reaction', { senderId: socket.data.clientId || socket.id, emoji });
  });

  socket.on('sync-play', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !canControlRoom(room, socket.id)) return;
    if (room.lastState) room.lastState.isPlaying = true;
    socket.to(roomId).emit('sync-play');
  });

  socket.on('sync-pause', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !canControlRoom(room, socket.id)) return;
    if (room.lastState) room.lastState.isPlaying = false;
    socket.to(roomId).emit('sync-pause');
  });

  socket.on('sync-next', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !canControlRoom(room, socket.id)) return;
    socket.to(roomId).emit('sync-next');
  });

  socket.on('sync-previous', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !canControlRoom(room, socket.id)) return;
    socket.to(roomId).emit('sync-previous');
  });

  socket.on('sync-skip', ({ roomId, index }) => {
    const room = rooms.get(roomId);
    if (!room || !canControlRoom(room, socket.id)) return;
    if (room.lastState) room.lastState.currentTrackIndex = index ?? room.lastState.currentTrackIndex;
    socket.to(roomId).emit('sync-skip', { index });
  });

  socket.on('sync-seek', ({ roomId, position }) => {
    const room = rooms.get(roomId);
    if (!room || !canControlRoom(room, socket.id)) return;
    if (room.lastState) room.lastState.position = position || 0;
    socket.to(roomId).emit('sync-seek', { position });
  });

  socket.on('request-sync', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.lastState) {
      socket.emit('sync-state', room.lastState);
    }
    const host = room.members.get(room.hostClientId);
    if (host?.online && host.socketId !== socket.id) {
      io.to(host.socketId).emit('request-sync');
    }
  });

  socket.on('sync-state', ({ roomId, queue, currentTrackIndex, position, isPlaying }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const nextQueue = Array.isArray(queue) ? queue.slice(0, MAX_QUEUE) : [];
    room.lastState = {
      queue: nextQueue,
      currentTrackIndex: currentTrackIndex ?? 0,
      position: position || 0,
      isPlaying: !!isPlaying,
    };
    socket.to(roomId).emit('sync-state', room.lastState);
  });

  socket.on('sync-queue', ({ roomId, queue, startIndex }) => {
    const room = rooms.get(roomId);
    if (!room || !canControlRoom(room, socket.id)) return;
    const nextQueue = Array.isArray(queue) ? queue.slice(0, MAX_QUEUE) : [];
    room.lastState = {
      queue: nextQueue,
      currentTrackIndex: startIndex || 0,
      position: 0,
      isPlaying: true,
    };
    socket.to(roomId).emit('sync-queue', { queue: nextQueue, startIndex });
  });

  socket.on('disconnect', () => {
    if (DEBUG) console.log('User disconnected:', socket.id);
    const roomId = socket.data.roomId as string | undefined;
    const clientId = socket.data.clientId as string | undefined;
    if (roomId && clientId) {
      const room = rooms.get(roomId);
      const member = room?.members.get(clientId);
      if (member && member.socketId === socket.id) {
        member.online = false;
        member.lastSeen = Date.now();
        emitRoomUpdate(roomId);
        scheduleLeave(roomId, clientId);
      }
      return;
    }
    for (const [id, room] of rooms.entries()) {
      const member = memberBySocket(room, socket.id);
      if (member) {
        member.online = false;
        member.lastSeen = Date.now();
        emitRoomUpdate(id);
        scheduleLeave(id, member.clientId);
      }
    }
  });
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.listen(PORT, () => {
  console.log(`Socket Server is running on port ${PORT}`);
});
