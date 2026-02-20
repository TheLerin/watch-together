const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*', // We'll restrict this in production
        methods: ['GET', 'POST']
    }
});

// Basic in-memory store for rooms
// Structure: { roomId: { users: [{ id, nickname, role }], videoState: { url, isPlaying, playedSeconds, updatedAt } } }
const rooms = {};

app.get('/', (req, res) => {
    res.send('WatchSync API is running');
});

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join_room', ({ roomId, nickname }) => {
        socket.join(roomId);

        if (!rooms[roomId]) {
            rooms[roomId] = {
                users: [],
                videoState: {
                    url: '',
                    magnetURI: '',
                    isPlaying: false,
                    playedSeconds: 0,
                    updatedAt: Date.now()
                }
            };
        }

        // First user is Host, subsequent are Viewers
        const role = rooms[roomId].users.length === 0 ? 'Host' : 'Viewer';
        const user = { id: socket.id, nickname, role };

        rooms[roomId].users.push(user);

        // Track which room this socket is in
        socket.roomId = roomId;

        console.log(`${nickname} (${socket.id}) joined room ${roomId} as ${role}`);

        // Send current room state to the new user
        socket.emit('room_joined', {
            user,
            existingUsers: rooms[roomId].users,
            videoState: rooms[roomId].videoState,
            chatHistory: [] // Will implement chat history storage later if needed
        });

        // Notify others in the room
        socket.to(roomId).emit('user_joined', user);
    });

    socket.on('send_message', ({ roomId, message }) => {
        // Broadcast to everyone in the room EXCEPT sender
        socket.to(roomId).emit('receive_message', message);
    });

    // --- ROLE MANAGEMENT ---

    // Helper to get socket's current user object
    const getUserInRoom = (sId, rId) => {
        if (!rooms[rId] || !rooms[rId].users) return null;
        return rooms[rId].users.find(u => u.id === sId);
    };

    socket.on('promote_to_moderator', ({ roomId, targetId }) => {
        const sender = getUserInRoom(socket.id, roomId);
        const target = getUserInRoom(targetId, roomId);

        if (sender && target && sender.role === 'Host' && target.role === 'Viewer') {
            target.role = 'Moderator';
            io.to(roomId).emit('role_updated', { userId: targetId, newRole: 'Moderator' });
            console.log(`Host ${socket.id} promoted ${targetId} to Moderator in ${roomId}`);
        }
    });

    socket.on('demote_to_viewer', ({ roomId, targetId }) => {
        const sender = getUserInRoom(socket.id, roomId);
        const target = getUserInRoom(targetId, roomId);

        if (sender && target && sender.role === 'Host' && target.role === 'Moderator') {
            target.role = 'Viewer';
            io.to(roomId).emit('role_updated', { userId: targetId, newRole: 'Viewer' });
            console.log(`Host ${socket.id} demoted ${targetId} to Viewer in ${roomId}`);
        }
    });

    socket.on('transfer_host', ({ roomId, targetId }) => {
        const sender = getUserInRoom(socket.id, roomId);
        const target = getUserInRoom(targetId, roomId);

        if (sender && target && sender.role === 'Host') {
            sender.role = 'Moderator'; // Host becomes Moderator upon transferring
            target.role = 'Host';

            // Broadcast the updates simultaneously 
            io.to(roomId).emit('role_updated', { userId: socket.id, newRole: 'Moderator' });
            io.to(roomId).emit('role_updated', { userId: targetId, newRole: 'Host' });

            console.log(`${socket.id} transferred Host to ${targetId} in ${roomId}`);
        }
    });

    socket.on('kick_user', ({ roomId, targetId }) => {
        const sender = getUserInRoom(socket.id, roomId);
        const target = getUserInRoom(targetId, roomId);

        if (!sender || !target) return;

        // Permissions:
        // Host can kick anyone.
        // Moderator can only kick Viewers.
        const canKick = sender.role === 'Host' || (sender.role === 'Moderator' && target.role === 'Viewer');

        if (canKick) {
            // Tell the user they were kicked
            io.to(targetId).emit('user_kicked');

            // Forcibly remove them from the room memory
            if (rooms[roomId] && rooms[roomId].users) {
                rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== targetId);
            }
            io.to(roomId).emit('user_left', targetId);

            // Forcibly make their socket leave the room channel
            const targetSocket = io.sockets.sockets.get(targetId);
            if (targetSocket) {
                targetSocket.leave(roomId);
                targetSocket.roomId = null;
            }

            console.log(`${sender.id} (${sender.role}) kicked ${targetId} from ${roomId}`);

            // Cleanup empty rooms
            if (rooms[roomId] && rooms[roomId].users.length === 0) {
                delete rooms[roomId];
            }
        }
    });

    // --- VIDEO SYNC MANAGEMENT ---

    socket.on('change_video', ({ roomId, url, magnetURI }) => {
        const sender = getUserInRoom(socket.id, roomId);
        if (sender && (sender.role === 'Host' || sender.role === 'Moderator')) {
            if (rooms[roomId]) {
                const newState = { url: url || '', magnetURI: magnetURI || '', isPlaying: false, playedSeconds: 0, updatedAt: Date.now() };
                rooms[roomId].videoState = newState;
                io.to(roomId).emit('video_changed', newState);
                console.log(`Video changed in ${roomId} to URL:${url} Magnet:${magnetURI ? 'YES' : 'NO'}`);
            }
        }
    });

    socket.on('play_video', ({ roomId }) => {
        const sender = getUserInRoom(socket.id, roomId);
        if (sender && (sender.role === 'Host' || sender.role === 'Moderator')) {
            if (rooms[roomId] && !rooms[roomId].videoState.isPlaying) {
                rooms[roomId].videoState.isPlaying = true;
                rooms[roomId].videoState.updatedAt = Date.now();
                // Broadcast play signal, exclude sender to prevent bounce back
                socket.to(roomId).emit('video_played');
            }
        }
    });

    socket.on('pause_video', ({ roomId }) => {
        const sender = getUserInRoom(socket.id, roomId);
        if (sender && (sender.role === 'Host' || sender.role === 'Moderator')) {
            if (rooms[roomId] && rooms[roomId].videoState.isPlaying) {
                rooms[roomId].videoState.isPlaying = false;
                rooms[roomId].videoState.updatedAt = Date.now();
                socket.to(roomId).emit('video_paused');
            }
        }
    });

    socket.on('seek_video', ({ roomId, playedSeconds }) => {
        const sender = getUserInRoom(socket.id, roomId);
        if (sender && (sender.role === 'Host' || sender.role === 'Moderator')) {
            if (rooms[roomId]) {
                rooms[roomId].videoState.playedSeconds = playedSeconds;
                rooms[roomId].videoState.updatedAt = Date.now();
                socket.to(roomId).emit('video_seeked', playedSeconds);
            }
        }
    });

    // --- DISCONNECT HANDLING ---

    const handleDisconnect = () => {
        const roomId = socket.roomId;
        if (roomId && rooms[roomId] && rooms[roomId].users) {
            rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
            socket.to(roomId).emit('user_left', socket.id);
            console.log(`User ${socket.id} left room ${roomId}`);

            // Cleanup empty rooms
            if (rooms[roomId].users.length === 0) {
                delete rooms[roomId];
            }
        }
    };

    socket.on('leave_room', handleDisconnect);
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        handleDisconnect();
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
