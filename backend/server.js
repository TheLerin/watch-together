const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const FRONTEND_URL = process.env.CORS_ORIGIN || 'http://localhost:5173';

const app = express();
app.use(cors({ origin: FRONTEND_URL }));

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: FRONTEND_URL,
        methods: ['GET', 'POST']
    }
});

// ── Local BitTorrent Tracker ────────────────────────────────────────────────
// Removed: We now use public WebTorrent trackers to support Vercel/Render serverless.

// In-memory store
// rooms[roomId] = { users: [], videoState: {...}, queue: [] }
const rooms = {};

app.get('/', (req, res) => {
    res.send('WatchSync API is running');
});

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join_room', ({ roomId, nickname, userId }) => {
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
                },
                queue: []
            };
        }

        const existingUser = rooms[roomId].users.find(u => u.userId === userId);
        let user;

        if (existingUser) {
            // Reconnect: Update socket ID but keep role
            existingUser.id = socket.id;
            existingUser.nickname = nickname; // In case they changed it
            existingUser.connected = true;
            user = existingUser;
            console.log(`${nickname} (${socket.id}) rejoined room ${roomId} as ${user.role}`);
        } else {
            // New connection
            const role = rooms[roomId].users.length === 0 ? 'Host' : 'Viewer';
            user = { id: socket.id, userId, nickname, role, connected: true };
            rooms[roomId].users.push(user);
            console.log(`${nickname} (${socket.id}) joined room ${roomId} as ${role}`);
        }

        socket.roomId = roomId;
        socket.userId = userId;

        socket.emit('room_joined', {
            user,
            existingUsers: rooms[roomId].users.filter(u => u.connected),
            videoState: rooms[roomId].videoState,
            queue: rooms[roomId].queue,
            chatHistory: []
        });

        socket.to(roomId).emit('user_joined', user);
    });

    socket.on('send_message', ({ roomId, message }) => {
        socket.to(roomId).emit('receive_message', message);
    });

    // --- ROLE MANAGEMENT ---

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
        }
    });

    socket.on('demote_to_viewer', ({ roomId, targetId }) => {
        const sender = getUserInRoom(socket.id, roomId);
        const target = getUserInRoom(targetId, roomId);
        if (sender && target && sender.role === 'Host' && target.role === 'Moderator') {
            target.role = 'Viewer';
            io.to(roomId).emit('role_updated', { userId: targetId, newRole: 'Viewer' });
        }
    });

    socket.on('transfer_host', ({ roomId, targetId }) => {
        const sender = getUserInRoom(socket.id, roomId);
        const target = getUserInRoom(targetId, roomId);
        if (sender && target && sender.role === 'Host') {
            sender.role = 'Moderator';
            target.role = 'Host';
            io.to(roomId).emit('role_updated', { userId: socket.id, newRole: 'Moderator' });
            io.to(roomId).emit('role_updated', { userId: targetId, newRole: 'Host' });
        }
    });

    socket.on('kick_user', ({ roomId, targetId }) => {
        const sender = getUserInRoom(socket.id, roomId);
        const target = getUserInRoom(targetId, roomId);
        if (!sender || !target) return;
        const canKick = sender.role === 'Host' || (sender.role === 'Moderator' && target.role === 'Viewer');
        if (canKick) {
            io.to(targetId).emit('user_kicked');
            if (rooms[roomId] && rooms[roomId].users) {
                rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== targetId);
            }
            io.to(roomId).emit('user_left', targetId);
            const targetSocket = io.sockets.sockets.get(targetId);
            if (targetSocket) {
                targetSocket.leave(roomId);
                targetSocket.roomId = null;
            }
            if (rooms[roomId] && rooms[roomId].users.length === 0) {
                delete rooms[roomId];
            }
        }
    });

    // --- VIDEO SYNC MANAGEMENT ---

    // Play a video immediately (replaces current)
    socket.on('change_video', ({ roomId, url, magnetURI }) => {
        const sender = getUserInRoom(socket.id, roomId);
        if (sender && (sender.role === 'Host' || sender.role === 'Moderator')) {
            if (rooms[roomId]) {
                const newState = { url: url || '', magnetURI: magnetURI || '', isPlaying: true, playedSeconds: 0, updatedAt: Date.now() };
                rooms[roomId].videoState = newState;
                io.to(roomId).emit('video_changed', newState);
                console.log(`Video changed in ${roomId} to URL:${url || 'P2P'}`);
            }
        }
    });

    // Host periodically syncs playback position  
    socket.on('sync_progress', ({ roomId, playedSeconds }) => {
        const sender = getUserInRoom(socket.id, roomId);
        if (sender && (sender.role === 'Host' || sender.role === 'Moderator')) {
            if (rooms[roomId]) {
                rooms[roomId].videoState.playedSeconds = playedSeconds;
                rooms[roomId].videoState.updatedAt = Date.now();
                // Broadcast drift correction to viewers (they only act if drift > threshold)
                socket.to(roomId).emit('video_progress', { playedSeconds });
            }
        }
    });

    // Add to queue — pushes to the end of the queue
    socket.on('add_to_queue', ({ roomId, url, magnetURI, label }) => {
        const sender = getUserInRoom(socket.id, roomId);
        if (sender && (sender.role === 'Host' || sender.role === 'Moderator')) {
            if (rooms[roomId]) {
                const item = { id: Date.now().toString(), url: url || '', magnetURI: magnetURI || '', label: label || url || 'Unnamed' };
                rooms[roomId].queue.push(item);
                io.to(roomId).emit('queue_updated', rooms[roomId].queue);
                console.log(`${sender.nickname} added to queue in ${roomId}: ${item.label}`);
            }
        }
    });

    // Remove item from queue
    socket.on('remove_from_queue', ({ roomId, itemId }) => {
        const sender = getUserInRoom(socket.id, roomId);
        if (sender && (sender.role === 'Host' || sender.role === 'Moderator')) {
            if (rooms[roomId]) {
                rooms[roomId].queue = rooms[roomId].queue.filter(i => i.id !== itemId);
                io.to(roomId).emit('queue_updated', rooms[roomId].queue);
            }
        }
    });

    // Play next in queue
    socket.on('play_next', ({ roomId }) => {
        const sender = getUserInRoom(socket.id, roomId);
        if (sender && (sender.role === 'Host' || sender.role === 'Moderator')) {
            if (rooms[roomId] && rooms[roomId].queue.length > 0) {
                const next = rooms[roomId].queue.shift();
                const newState = { url: next.url, magnetURI: next.magnetURI, isPlaying: true, playedSeconds: 0, updatedAt: Date.now() };
                rooms[roomId].videoState = newState;
                io.to(roomId).emit('video_changed', newState);
                io.to(roomId).emit('queue_updated', rooms[roomId].queue);
                console.log(`Playing next in queue for room ${roomId}: ${next.label}`);
            }
        }
    });

    socket.on('play_video', ({ roomId }) => {
        const sender = getUserInRoom(socket.id, roomId);
        if (sender && (sender.role === 'Host' || sender.role === 'Moderator')) {
            if (rooms[roomId] && !rooms[roomId].videoState.isPlaying) {
                rooms[roomId].videoState.isPlaying = true;
                rooms[roomId].videoState.updatedAt = Date.now();
                socket.to(roomId).emit('video_played');
            }
        }
    });

    socket.on('pause_video', ({ roomId, playedSeconds }) => {
        const sender = getUserInRoom(socket.id, roomId);
        if (sender && (sender.role === 'Host' || sender.role === 'Moderator')) {
            if (rooms[roomId]) {
                rooms[roomId].videoState.isPlaying = false;
                rooms[roomId].videoState.updatedAt = Date.now();
                if (playedSeconds !== undefined) {
                    rooms[roomId].videoState.playedSeconds = playedSeconds;
                }
                socket.to(roomId).emit('video_paused', { playedSeconds: rooms[roomId].videoState.playedSeconds });
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
        const userId = socket.userId;
        if (roomId && rooms[roomId] && rooms[roomId].users) {
            const user = rooms[roomId].users.find(u => u.userId === userId);
            if (user) {
                user.connected = false;
                socket.to(roomId).emit('user_left', socket.id);
                console.log(`User ${user.nickname || socket.id} disconnected from room ${roomId}`);

                // Allow a grace period before removing the user, or remove immediately if room is empty of connected users
                if (!rooms[roomId].users.some(u => u.connected)) {
                    // Empty room, delete state
                    delete rooms[roomId];
                }
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
