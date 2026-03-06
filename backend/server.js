const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { si } = require('nyaapi');

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

// ── Nyaa.si Anime Search Endpoint ──────────────────────────────────────────
// Uses nyaapi to search for anime torrents on Nyaa.si and return magnet links.
// The frontend uses these magnet links directly with WebTorrent for P2P streaming.
app.get('/api/nyaa/search', async (req, res) => {
    try {
        const q = req.query.q;
        const page = parseInt(req.query.page) || 1;
        const filter = parseInt(req.query.filter) || 0; // 0=No filter, 2=Trusted
        const category = req.query.category || '1_2'; // 1_2 = English anime

        if (!q) return res.status(400).json({ error: 'Missing query' });

        const results = await si.search({
            term: q,
            n: 20,
            p: page,
            filter,
            category,
        });

        const mapped = (results || []).map(r => ({
            name: r.name,
            magnet: r.magnet,
            size: r.filesize,
            seeders: r.seeders,
            leechers: r.leechers,
            date: r.date,
            trusted: r.trusted === 'Yes',
        }));

        res.json({ results: mapped });
    } catch (err) {
        console.error('Nyaa search error:', err);
        res.status(500).json({ error: 'Search failed' });
    }
});


// ── Google Drive Proxy Stream Endpoint ─────────────────────────────────────
// Proxies Google Drive public files to bypass CORS restrictions.
// Usage: GET /api/drive/stream/:fileId
app.get('/api/drive/stream/:fileId', async (req, res) => {
    const { fileId } = req.params;
    if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
        return res.status(400).json({ error: 'Invalid file ID' });
    }

    try {
        const fetch = (await import('node-fetch')).default;

        // Build headers — forward Range for seek support
        const baseHeaders = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
        if (req.headers.range) {
            baseHeaders['Range'] = req.headers.range;
        }

        let downloadUrl = `https://drive.google.com/uc?export=download&confirm=t&id=${fileId}`;
        let response = await fetch(downloadUrl, { headers: baseHeaders, redirect: 'follow' });

        // If the response is HTML, it means one of two things:
        // 1. The file is large and showing the virus scan warning.
        // 2. The file is private and redirected to Google Login.
        let contentType = response.headers.get('content-type') || '';

        if (contentType.includes('text/html')) {
            const html = await response.text();

            // Check if it's a login redirect (file is private)
            if (html.includes('ServiceLogin') || response.url.includes('accounts.google.com')) {
                console.error(`Drive proxy: File ${fileId} is private/restricted.`);
                return res.status(403).json({ error: 'This Google Drive link is private or requires login. Please make sure link sharing is set to "Anyone with the link".' });
            }

            // Otherwise, see if it's the virus scan warning
            const rawCookies = response.headers.raw()['set-cookie'] || [];
            const cookieString = rawCookies.map(c => c.split(';')[0]).join('; ');

            const formAction = html.match(/id="download-form"[^>]*action="([^"]+)"/);
            const uuidMatch = html.match(/name="uuid" value="([^"]+)"/);

            if (formAction) {
                let actionUrl = formAction[1].replace(/&amp;/g, '&');
                if (!actionUrl.startsWith('http')) actionUrl = 'https://drive.google.com' + actionUrl;
                if (uuidMatch) actionUrl += '&uuid=' + uuidMatch[1];

                const retryHeaders = { ...baseHeaders, 'Cookie': cookieString };
                response = await fetch(actionUrl, { headers: retryHeaders, redirect: 'follow' });
            } else {
                // Try fallback /uc URL with cookies
                const retryHeaders = { ...baseHeaders, 'Cookie': cookieString };
                response = await fetch(`https://drive.google.com/uc?export=download&confirm=t&id=${fileId}`, { headers: retryHeaders, redirect: 'follow' });
            }
        }

        // Final sanity check: if we STILL have HTML, it's unplayable.
        contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
            if (response.url.includes('accounts.google.com')) {
                return res.status(403).json({ error: 'File is private or requires login.' });
            }
            return res.status(400).json({ error: 'Google Drive returned an HTML page instead of a video file. This might occur if the file is restricted or hit download limits.' });
        }

        if (!response.ok && response.status !== 206) {
            console.error('Drive proxy: non-OK status', response.status);
            return res.status(response.status).json({ error: 'Failed to fetch file from Google Drive' });
        }

        // Forward relevant headers
        const fwdHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-disposition'];
        fwdHeaders.forEach(h => {
            const val = response.headers.get(h);
            if (val) res.setHeader(h, val);
        });
        res.setHeader('Access-Control-Allow-Origin', '*');

        res.status(response.status);
        response.body.pipe(res);
    } catch (err) {
        console.error('Google Drive proxy error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to stream from Google Drive' });
        }
    }
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

    // --- WEBRTC SIGNALING RELAY (local video streaming) ---
    // These events carry only tiny SDP/ICE JSON payloads — no video data.

    socket.on('webrtc_offer', ({ roomId, targetId, sdp }) => {
        // Host → specific viewer: "here is my stream offer"
        socket.to(targetId).emit('webrtc_offer', { fromId: socket.id, sdp });
    });

    socket.on('webrtc_answer', ({ roomId, targetId, sdp }) => {
        // Viewer → host: "I accept your offer"
        socket.to(targetId).emit('webrtc_answer', { fromId: socket.id, sdp });
    });

    socket.on('webrtc_ice_candidate', ({ roomId, targetId, candidate }) => {
        // Relay ICE candidate from either side to the other
        socket.to(targetId).emit('webrtc_ice_candidate', { fromId: socket.id, candidate });
    });

    socket.on('webrtc_stream_ready', ({ roomId }) => {
        // Host broadcasts: "I am now streaming a local file, viewers should expect an offer"
        const sender = getUserInRoom(socket.id, roomId);
        if (sender && sender.role === 'Host') {
            socket.to(roomId).emit('webrtc_stream_ready', { hostId: socket.id });
        }
    });

    socket.on('webrtc_stream_stopped', ({ roomId }) => {
        // Host broadcasts: "I stopped streaming the local file"
        const sender = getUserInRoom(socket.id, roomId);
        if (sender && sender.role === 'Host') {
            socket.to(roomId).emit('webrtc_stream_stopped');
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
