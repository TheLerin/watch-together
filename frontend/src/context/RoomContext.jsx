/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { socket } from '../socket';
import { HostStreamer, ViewerReceiver } from '../services/WebRTCService';
import toast from 'react-hot-toast';

const RoomContext = createContext();

export const useRoom = () => useContext(RoomContext);

export const RoomProvider = ({ children }) => {
    const [isRestoringSession, setIsRestoringSession] = useState(true);
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

    // ── WebRTC local video streaming ──────────────────────────────────────────
    const [remoteStream, setRemoteStream] = useState(null);   // Viewer side: incoming MediaStream
    const [isHostStreaming, setIsHostStreaming] = useState(false); // Host side: currently streaming a local file
    const hostStreamerRef = useRef(null);   // HostStreamer instance (host only)
    const viewerReceiverRef = useRef(null); // ViewerReceiver instance (viewer only)
    // Store hostSocketId so viewer can relay ICE back to the right peer
    const hostSocketIdRef = useRef(null);

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
            setIsRestoringSession(false);
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

        // ── WebRTC signaling ─────────────────────────────────────────────────
        // Viewer receives offer from host
        async function onWebRTCOffer({ fromId, sdp }) {
            hostSocketIdRef.current = fromId;
            const receiver = new ViewerReceiver(socket, null);
            viewerReceiverRef.current = receiver;
            receiver.onStream((stream) => {
                setRemoteStream(stream);
                toast('📡 Local file stream connected!', { duration: 3000, icon: '🎬' });
            });
            await receiver.handleOffer(fromId, sdp);
        }

        // Host receives answer from a viewer
        async function onWebRTCAnswer({ fromId, sdp }) {
            await hostStreamerRef.current?.handleAnswer(fromId, sdp);
        }

        // Either side receives ICE candidate from the other
        async function onWebRTCIce({ fromId, candidate }) {
            if (hostStreamerRef.current) {
                // We are the host — candidate is from a viewer
                await hostStreamerRef.current.handleIceCandidate(fromId, candidate);
            } else if (viewerReceiverRef.current) {
                // We are a viewer — candidate is from the host
                await viewerReceiverRef.current.handleIceCandidate(candidate);
            }
        }

        // Viewer notified that host started streaming
        async function onWebRTCStreamReady({ hostId }) {
            // The host will send us an offer shortly, nothing to do yet
            hostSocketIdRef.current = hostId;
        }

        // Viewer notified that host stopped the stream
        function onWebRTCStreamStopped() {
            viewerReceiverRef.current?.stop();
            viewerReceiverRef.current = null;
            setRemoteStream(null);
            toast('Host stopped the local stream.', { icon: '⏹️', duration: 3000 });
        }

        // When a new viewer joins, if we are the host and streaming, send them an offer
        const origOnUserJoined = onUserJoined;
        socket.off('user_joined', origOnUserJoined); // reattach with addon below
        function onUserJoinedWithStream(newUser) {
            origOnUserJoined(newUser);
            if (hostStreamerRef.current) {
                hostStreamerRef.current.addViewer(newUser.id);
            }
        }
        socket.on('user_joined', onUserJoinedWithStream);

        socket.on('webrtc_offer', onWebRTCOffer);
        socket.on('webrtc_answer', onWebRTCAnswer);
        socket.on('webrtc_ice_candidate', onWebRTCIce);
        socket.on('webrtc_stream_ready', onWebRTCStreamReady);
        socket.on('webrtc_stream_stopped', onWebRTCStreamStopped);

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('room_joined', onRoomJoined);
            socket.off('user_joined');
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
            socket.off('webrtc_offer', onWebRTCOffer);
            socket.off('webrtc_answer', onWebRTCAnswer);
            socket.off('webrtc_ice_candidate', onWebRTCIce);
            socket.off('webrtc_stream_ready', onWebRTCStreamReady);
            socket.off('webrtc_stream_stopped', onWebRTCStreamStopped);
        };
    }, []);

    // --- Auto-reconnect from localStorage ---
    useEffect(() => {
        const savedSession = localStorage.getItem('watchTogetherSession');
        if (!savedSession) {
            setIsRestoringSession(false);
            return;
        }

        // If there's a session but socket isn't connected, we need to proactively connect
        if (!socket.connected) {
            socket.connect();
        }
    }, []);

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
                } else {
                    setIsRestoringSession(false);
                }
            } catch (e) {
                console.error('Failed to parse saved session', e);
                setIsRestoringSession(false);
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

    // ── WebRTC: start streaming a visible <video> element to all viewers ─────────
    const startLocalStream = useCallback(async (videoEl) => {
        if (!videoEl || !roomId) return;
        // Stop any existing stream first
        if (hostStreamerRef.current) {
            hostStreamerRef.current.stop();
            hostStreamerRef.current = null;
        }

        const viewerIds = users
            .filter(u => u.id !== socket.id && u.connected !== false)
            .map(u => u.id);

        const streamer = new HostStreamer(socket, roomId);
        hostStreamerRef.current = streamer;

        try {
            await streamer.start(videoEl, viewerIds);
            setIsHostStreaming(true);
            socket.emit('webrtc_stream_ready', { roomId });
            socket.emit('change_video', { roomId, url: '', magnetURI: 'local', isPlaying: true, playedSeconds: 0, updatedAt: Date.now() });
        } catch (err) {
            hostStreamerRef.current = null;
            setIsHostStreaming(false);
            throw err;
        }
    }, [roomId, users]);

    const stopLocalStream = useCallback(() => {
        hostStreamerRef.current?.stop();
        hostStreamerRef.current = null;
        setIsHostStreaming(false);
        socket.emit('webrtc_stream_stopped', { roomId });
        socket.emit('change_video', { roomId, url: '', magnetURI: '', isPlaying: false, playedSeconds: 0, updatedAt: Date.now() });
    }, [roomId]);

    // Expose streamer so VideoPlayer can control playback (seek/play/pause)
    const getHostStreamer = useCallback(() => hostStreamerRef.current, []);

    return (
        <RoomContext.Provider value={{
            isRestoringSession,
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
            // WebRTC local streaming
            remoteStream,
            isHostStreaming,
            startLocalStream,
            stopLocalStream,
            getHostStreamer,
        }}>
            {children}
        </RoomContext.Provider>
    );
};
