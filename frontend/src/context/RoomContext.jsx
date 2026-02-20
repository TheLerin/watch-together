/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { socket } from '../socket';
import toast from 'react-hot-toast';

const RoomContext = createContext();

export const useRoom = () => useContext(RoomContext);

export const RoomProvider = ({ children }) => {
    const [isConnected, setIsConnected] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [users, setUsers] = useState([]);
    const [messages, setMessages] = useState([]);
    const [roomId, setRoomId] = useState(null);
    const [videoState, setVideoState] = useState({
        url: '',
        magnetURI: '',
        isPlaying: false,
        playedSeconds: 0,
        updatedAt: 0
    });
    const [queue, setQueue] = useState([]);
    const isKicked = useRef(false);

    useEffect(() => {
        function onConnect() { setIsConnected(true); }
        function onDisconnect() {
            setIsConnected(false);
            setCurrentUser(null);
        }
        function onRoomJoined({ user, existingUsers, videoState: initialVideoState, queue: initialQueue, chatHistory }) {
            setCurrentUser(user);
            setUsers(existingUsers);
            if (initialVideoState) setVideoState(initialVideoState);
            if (initialQueue) setQueue(initialQueue);
            setMessages(chatHistory || []);
        }
        function onUserJoined(newUser) {
            setUsers(prev => {
                if (prev.some(u => u.id === newUser.id)) return prev;
                toast(`${newUser.nickname} joined`, { icon: '👋', duration: 2000 });
                return [...prev, newUser];
            });
        }
        function onUserLeft(userId) {
            setUsers(prev => {
                const leaving = prev.find(u => u.id === userId);
                if (leaving) toast(`${leaving.nickname} left`, { icon: '🚪', duration: 2000 });
                return prev.filter(u => u.id !== userId);
            });
        }
        function onReceiveMessage(message) {
            setMessages(prev => {
                if (prev.some(m => m.id === message.id)) return prev;
                return [...prev, message];
            });
        }
        function onRoleUpdated({ userId, newRole }) {
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
            setCurrentUser(prev => prev?.id === userId ? { ...prev, role: newRole } : prev);
        }
        function onUserKicked() {
            isKicked.current = true;
            localStorage.removeItem('watchTogetherSession');
            alert('You have been kicked from the room by the Host.');
            window.location.href = '/';
        }

        const addSystemMessage = (text) => {
            setMessages(prev => [...prev, {
                id: Date.now() + Math.random().toString(),
                nickname: 'System',
                text,
                timestamp: Date.now(),
                isSystem: true
            }]);
        };

        function onVideoChanged(newState) {
            setVideoState(newState);
            addSystemMessage('The video has been changed.');
        }
        function onVideoPlayed() {
            setVideoState(prev => ({ ...prev, isPlaying: true, updatedAt: Date.now() }));
            toast('▶️ Playing', { duration: 1500 });
        }
        function onVideoPaused({ playedSeconds } = {}) {
            setVideoState(prev => ({
                ...prev,
                isPlaying: false,
                ...(playedSeconds !== undefined ? { playedSeconds } : {}),
                updatedAt: Date.now()
            }));
            toast('⏸️ Paused', { duration: 1500 });
        }
        function onVideoProgress({ playedSeconds }) {
            // Drift correction — only updates state without triggering a seek on host side
            setVideoState(prev => ({ ...prev, playedSeconds, updatedAt: Date.now() }));
        }
        function onVideoSeeked(playedSeconds) {
            setVideoState(prev => ({ ...prev, playedSeconds, updatedAt: Date.now() }));
        }
        function onQueueUpdated(newQueue) {
            setQueue(newQueue);
        }

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('room_joined', onRoomJoined);
        socket.on('user_joined', onUserJoined);
        socket.on('user_left', onUserLeft);
        socket.on('receive_message', onReceiveMessage);
        socket.on('role_updated', onRoleUpdated);
        socket.on('user_kicked', onUserKicked);
        socket.on('video_changed', onVideoChanged);
        socket.on('video_played', onVideoPlayed);
        socket.on('video_paused', onVideoPaused);
        socket.on('video_progress', onVideoProgress);
        socket.on('video_seeked', onVideoSeeked);
        socket.on('queue_updated', onQueueUpdated);

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('room_joined', onRoomJoined);
            socket.off('user_joined', onUserJoined);
            socket.off('user_left', onUserLeft);
            socket.off('receive_message', onReceiveMessage);
            socket.off('role_updated', onRoleUpdated);
            socket.off('user_kicked', onUserKicked);
            socket.off('video_changed', onVideoChanged);
            socket.off('video_played', onVideoPlayed);
            socket.off('video_paused', onVideoPaused);
            socket.off('video_progress', onVideoProgress);
            socket.off('video_seeked', onVideoSeeked);
            socket.off('queue_updated', onQueueUpdated);
        };
    }, []);

    // --- Auto-reconnect from localStorage ---
    useEffect(() => {
        const savedSession = localStorage.getItem('watchTogetherSession');
        if (savedSession && isConnected && !currentUser) {
            try {
                let sessionData = JSON.parse(savedSession);
                let { roomId: savedRoomId, nickname, userId } = sessionData;

                if (savedRoomId && nickname) {
                    if (!userId) {
                        userId = Math.random().toString(36).substring(2, 15);
                        sessionData.userId = userId;
                        localStorage.setItem('watchTogetherSession', JSON.stringify(sessionData));
                    }
                    setRoomId(savedRoomId);
                    socket.emit('join_room', { roomId: savedRoomId, nickname, userId });
                }
            } catch (e) {
                console.error('Failed to parse saved session', e);
            }
        }
    }, [isConnected, currentUser]);

    const joinRoom = useCallback((id, nickname) => {
        setRoomId(id);
        const userId = Math.random().toString(36).substring(2, 15);
        localStorage.setItem('watchTogetherSession', JSON.stringify({ roomId: id, nickname, userId }));
        socket.connect();
        socket.emit('join_room', { roomId: id, nickname, userId });
    }, []);

    const leaveRoom = useCallback(() => {
        if (!isKicked.current) {
            socket.emit('leave_room', { roomId });
        }
        localStorage.removeItem('watchTogetherSession');
        socket.disconnect();
        setRoomId(null);
        setCurrentUser(null);
        setUsers([]);
        setMessages([]);
        setQueue([]);
        isKicked.current = false;
    }, [roomId]);

    const sendMessage = useCallback((text) => {
        if (!text.trim() || !currentUser) return;
        const msg = {
            id: Date.now() + Math.random().toString(),
            text,
            user: currentUser.nickname,
            role: currentUser.role,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, msg]);
        socket.emit('send_message', { roomId, message: msg });
    }, [roomId, currentUser]);

    const promoteUser = useCallback((targetId) => socket.emit('promote_to_moderator', { roomId, targetId }), [roomId]);
    const demoteUser = useCallback((targetId) => socket.emit('demote_to_viewer', { roomId, targetId }), [roomId]);
    const transferHost = useCallback((targetId) => socket.emit('transfer_host', { roomId, targetId }), [roomId]);
    const kickUser = useCallback((targetId) => socket.emit('kick_user', { roomId, targetId }), [roomId]);

    // --- Video Sync ---
    const loadVideo = useCallback((url, magnetURI = '') => {
        if (!url && !magnetURI) return;
        const newState = {
            url: url || '',
            magnetURI: magnetURI || '',
            isPlaying: true,
            playedSeconds: 0,
            updatedAt: Date.now()
        };
        setVideoState(newState);
        socket.emit('change_video', { roomId, ...newState });
    }, [roomId]);

    const playVideo = useCallback(() => {
        setVideoState(prev => {
            if (prev.isPlaying) return prev;
            socket.emit('play_video', { roomId });
            return { ...prev, isPlaying: true };
        });
    }, [roomId]);

    const pauseVideo = useCallback((playedSeconds) => {
        setVideoState(prev => {
            if (!prev.isPlaying) return prev;
            socket.emit('pause_video', { roomId, playedSeconds });
            return { ...prev, isPlaying: false, ...(playedSeconds !== undefined ? { playedSeconds } : {}) };
        });
    }, [roomId]);

    const syncProgress = useCallback((playedSeconds) => {
        // Host-only: periodically sync position to server
        socket.emit('sync_progress', { roomId, playedSeconds });
    }, [roomId]);

    const seekVideo = useCallback((seconds) => {
        setVideoState(prev => ({ ...prev, playedSeconds: seconds }));
        socket.emit('seek_video', { roomId, playedSeconds: seconds });
    }, [roomId]);

    // --- Queue Management ---
    const addToQueue = useCallback((url, magnetURI = '', label = '') => {
        if (!url && !magnetURI) return;
        socket.emit('add_to_queue', { roomId, url, magnetURI, label: label || url });
    }, [roomId]);

    const removeFromQueue = useCallback((itemId) => {
        socket.emit('remove_from_queue', { roomId, itemId });
    }, [roomId]);

    const playNext = useCallback(() => {
        socket.emit('play_next', { roomId });
    }, [roomId]);

    return (
        <RoomContext.Provider value={{
            isConnected,
            currentUser,
            users,
            messages,
            roomId,
            videoState,
            queue,
            joinRoom,
            leaveRoom,
            sendMessage,
            promoteUser,
            demoteUser,
            transferHost,
            kickUser,
            loadVideo,
            playVideo,
            pauseVideo,
            seekVideo,
            addToQueue,
            removeFromQueue,
            playNext,
            syncProgress,
        }}>
            {children}
        </RoomContext.Provider>
    );
};
