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
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 4000;

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (roomId: string) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  socket.on('sync-play', ({ roomId }) => {
    socket.to(roomId).emit('sync-play');
  });

  socket.on('sync-pause', ({ roomId }) => {
    socket.to(roomId).emit('sync-pause');
  });

  socket.on('sync-next', ({ roomId }) => {
    socket.to(roomId).emit('sync-next');
  });

  socket.on('sync-previous', ({ roomId }) => {
    socket.to(roomId).emit('sync-previous');
  });

  socket.on('sync-seek', ({ roomId, position }) => {
    socket.to(roomId).emit('sync-seek', { position });
  });

  // State Sync Events
  socket.on('request-sync', ({ roomId }) => {
    // A new user joined and asks for the current state.
    // The host (or whoever has the queue) will hear this and reply with sync-state.
    socket.to(roomId).emit('request-sync');
  });

  socket.on('sync-state', ({ roomId, queue, currentTrackIndex, position, isPlaying }) => {
    // Host sends the full state back to the room.
    socket.to(roomId).emit('sync-state', { queue, currentTrackIndex, position, isPlaying });
  });

  socket.on('sync-queue', ({ roomId, queue, startIndex }) => {
    // When a user selects a new song/playlist, update everyone's queue.
    socket.to(roomId).emit('sync-queue', { queue, startIndex });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Socket Server is running on port ${PORT}`);
});
