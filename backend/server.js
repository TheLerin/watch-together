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
// Structure: { roomId: [{ id: socket.id, nickname: string, role: string }] }
const rooms = {};

app.get('/', (req, res) => {
    res.send('WatchSync API is running');
});

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join_room', ({ roomId, nickname }) => {
        socket.join(roomId);

        if (!rooms[roomId]) {
            rooms[roomId] = [];
        }

        // First user is Host, subsequent are Viewers
        const role = rooms[roomId].length === 0 ? 'Host' : 'Viewer';
        const user = { id: socket.id, nickname, role };

        rooms[roomId].push(user);

        // Track which room this socket is in
        socket.roomId = roomId;

        console.log(`${nickname} (${socket.id}) joined room ${roomId} as ${role}`);

        // Send current room state to the new user
        socket.emit('room_joined', {
            user,
            existingUsers: rooms[roomId],
            chatHistory: [] // Will implement chat history storage later if needed
        });

        // Notify others in the room
        socket.to(roomId).emit('user_joined', user);
    });

    socket.on('send_message', ({ roomId, message }) => {
        // Broadcast to everyone in the room EXCEPT sender
        socket.to(roomId).emit('receive_message', message);
    });

    const handleDisconnect = () => {
        const roomId = socket.roomId;
        if (roomId && rooms[roomId]) {
            rooms[roomId] = rooms[roomId].filter(u => u.id !== socket.id);
            socket.to(roomId).emit('user_left', socket.id);
            console.log(`User ${socket.id} left room ${roomId}`);

            // Cleanup empty rooms
            if (rooms[roomId].length === 0) {
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
