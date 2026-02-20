import { io } from 'socket.io-client';

// 'autoConnect' set to false so we only connect when we actually join a room
const URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export const socket = io(URL, {
    autoConnect: false,
});
