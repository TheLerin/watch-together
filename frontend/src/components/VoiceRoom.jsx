import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Mic, MicOff, Phone, PhoneOff, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRoom } from '../context/RoomContext';
import { socket } from '../socket';

// ── ICE / TURN Configuration ─────────────────────────────────────────────────
//
// WHY TURN IS NEEDED IN PRODUCTION:
//   Locally both browsers run on the same machine / LAN so WebRTC can connect
//   directly (host candidates). In production each user is on a completely
//   different network, usually behind symmetric NAT or a corporate firewall
//   that blocks direct UDP. STUN discovers the public IP but cannot relay
//   traffic — that requires a TURN server. Without TURN, voice works on
//   localhost and silently fails in production.
//
// We combine multiple STUN servers (Google — very reliable, free, no account)
// with TURN via openrelay.metered.ca (free public relay). If you need higher
// reliability consider a paid Metered or Twilio TURN account and store the
// credentials in VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL env vars.
const TURN_USER = import.meta.env.VITE_TURN_USERNAME || 'openrelayproject';
const TURN_CRED = import.meta.env.VITE_TURN_CREDENTIAL || 'openrelayproject';

const ICE_SERVERS = {
    iceServers: [
        // Google STUN — discover public IP
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        // OpenRelay TURN — relay when STUN fails (behind strict NAT / firewall)
        // Port 80 and 443 bypass most corporate firewalls
        { urls: 'turn:openrelay.metered.ca:80',               username: TURN_USER, credential: TURN_CRED },
        { urls: 'turn:openrelay.metered.ca:443',              username: TURN_USER, credential: TURN_CRED },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: TURN_USER, credential: TURN_CRED },
        // Metered public STUN fallback
        { urls: 'stun:a.relay.metered.ca:80' },
    ],
    // Use "relay" to force all traffic through TURN (uncomment to debug TURN)
    // iceTransportPolicy: 'relay',
};

// ─────────────────────────────────────────────────────────────────────────────

const VoiceRoom = () => {
    const { roomId, currentUser, users, isConnected } = useRoom();
    const [isVoiceActive, setIsVoiceActive] = useState(false);
    const [isMuted, setIsMuted]             = useState(false);
    const [isExpanded, setIsExpanded]       = useState(false);

    const localStreamRef = useRef(null);
    const peersRef       = useRef({}); // { [socketId]: RTCPeerConnection }
    const audioRefs      = useRef({}); // { [socketId]: HTMLAudioElement }

    // FIX 1 — ICE candidate queue
    // In production, ice_candidate events arrive BEFORE setRemoteDescription
    // completes (high latency). Calling addIceCandidate before remoteDescription
    // is set throws a DOMException and the candidate is silently lost — the
    // connection never establishes. Buffer them here and flush after setRemote.
    const pendingCandidatesRef = useRef({}); // { [socketId]: RTCIceCandidate[] }

    // Stale-closure fix: the signaling useEffect captures isVoiceActive=false
    // at registration time. Without a ref, handleOffer always sees false and
    // discards every incoming offer — only the caller hears audio, never the receiver.
    const isVoiceActiveRef = useRef(false);
    useEffect(() => { isVoiceActiveRef.current = isVoiceActive; }, [isVoiceActive]);

    // Active voice users list (including self when active)
    const voiceUsers = users.filter(u => u.isVoiceActive);
    if (isVoiceActive && currentUser && !voiceUsers.some(u => u.id === currentUser.id)) {
        voiceUsers.push({ ...currentUser, isVoiceActive: true, isMuted });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    const cleanupPeer = (targetSocketId) => {
        const peer = peersRef.current[targetSocketId];
        if (peer) { peer.close(); delete peersRef.current[targetSocketId]; }
        const audio = audioRefs.current[targetSocketId];
        if (audio) { audio.pause(); audio.srcObject = null; delete audioRefs.current[targetSocketId]; }
        delete pendingCandidatesRef.current[targetSocketId];
    };

    const cleanupWebRTC = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }
        Object.keys(peersRef.current).forEach(cleanupPeer);
        peersRef.current     = {};
        audioRefs.current    = {};
        pendingCandidatesRef.current = {};
    };

    // FIX 2 — Flush queued ICE candidates after remote description is set
    const flushPendingCandidates = async (targetSocketId) => {
        const peer      = peersRef.current[targetSocketId];
        const queued    = pendingCandidatesRef.current[targetSocketId] || [];
        if (!peer || queued.length === 0) return;
        console.log(`[WebRTC] Flushing ${queued.length} queued ICE candidates for ${targetSocketId}`);
        for (const candidate of queued) {
            try { await peer.addIceCandidate(new RTCIceCandidate(candidate)); }
            catch (e) { console.warn('[WebRTC] addIceCandidate (flush) error:', e); }
        }
        pendingCandidatesRef.current[targetSocketId] = [];
    };

    // ── Peer connection factory ────────────────────────────────────────────────
    const createPeerConnection = useCallback(async (targetSocketId, isInitiator) => {
        // Always clean up any stale connection before creating a new one
        // (handles reconnect after 'failed' / 'disconnected' state)
        if (peersRef.current[targetSocketId]) {
            cleanupPeer(targetSocketId);
        }

        const peer = new RTCPeerConnection(ICE_SERVERS);
        peersRef.current[targetSocketId]          = peer;
        pendingCandidatesRef.current[targetSocketId] = [];

        // Attach local mic tracks
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track =>
                peer.addTrack(track, localStreamRef.current)
            );
        }

        // Forward ICE candidates to the other peer via the signaling server
        peer.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('webrtc_ice_candidate', { targetSocketId, candidate: event.candidate });
            }
        };

        // Log connection transitions — useful for debugging production failures
        peer.oniceconnectionstatechange = () =>
            console.log(`[WebRTC] ICE with ${targetSocketId}: ${peer.iceConnectionState}`);

        peer.onconnectionstatechange = () => {
            console.log(`[WebRTC] conn with ${targetSocketId}: ${peer.connectionState}`);
            if (['disconnected', 'failed', 'closed'].includes(peer.connectionState)) {
                cleanupPeer(targetSocketId);
            }
        };

        // FIX 3 — Autoplay fix
        // `audio.autoplay = true` is often silently blocked by the browser
        // autoplay policy in production. Explicitly call `.play()` after setting
        // srcObject; catch and ignore the AbortError that fires if the track ends
        // before playback starts (common on short reconnects).
        peer.ontrack = (event) => {
            let audio = audioRefs.current[targetSocketId];
            if (!audio) {
                audio = new Audio();
                audioRefs.current[targetSocketId] = audio;
            }
            audio.srcObject = event.streams[0];
            audio.play().catch(err => {
                // NotAllowedError: autoplay blocked — browser needs a user gesture
                // before it allows audio. In practice this should not happen here
                // because the user clicked "Join Voice" moments ago.
                console.warn('[WebRTC] audio.play() blocked:', err.name);
            });
        };

        // Create and send an offer if we are the one initiating
        if (isInitiator) {
            try {
                const offer = await peer.createOffer();
                await peer.setLocalDescription(offer);
                socket.emit('webrtc_offer', { targetSocketId, offer });
            } catch (err) {
                console.error('[WebRTC] createOffer error:', err);
            }
        }

        return peer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── WebRTC Signaling Event Handlers ──────────────────────────────────────
    useEffect(() => {
        if (!socket) return;

        const handleOffer = async ({ senderSocketId, offer }) => {
            // isVoiceActiveRef — see stale-closure comment above
            if (!isVoiceActiveRef.current) {
                console.log('[WebRTC] Ignoring offer — not in voice');
                return;
            }
            const peer = await createPeerConnection(senderSocketId, false);
            try {
                await peer.setRemoteDescription(new RTCSessionDescription(offer));
                // Flush any ICE candidates that arrived before the offer was processed
                await flushPendingCandidates(senderSocketId);
                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);
                socket.emit('webrtc_answer', { targetSocketId: senderSocketId, answer });
            } catch (err) {
                console.error('[WebRTC] handleOffer error:', err);
            }
        };

        const handleAnswer = async ({ senderSocketId, answer }) => {
            const peer = peersRef.current[senderSocketId];
            if (!peer) return;
            try {
                await peer.setRemoteDescription(new RTCSessionDescription(answer));
                // Flush any ICE candidates that arrived before the answer was processed
                await flushPendingCandidates(senderSocketId);
            } catch (err) {
                console.error('[WebRTC] handleAnswer error:', err);
            }
        };

        // FIX 1 (continued) — Queue candidates if remote description not yet set
        const handleIceCandidate = async ({ senderSocketId, candidate }) => {
            const peer = peersRef.current[senderSocketId];
            if (!peer || !peer.remoteDescription) {
                // Remote description not set yet — queue for later
                if (!pendingCandidatesRef.current[senderSocketId]) {
                    pendingCandidatesRef.current[senderSocketId] = [];
                }
                pendingCandidatesRef.current[senderSocketId].push(candidate);
                console.log(`[WebRTC] Queued ICE candidate for ${senderSocketId} (remoteDescription not ready)`);
                return;
            }
            try {
                await peer.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.warn('[WebRTC] addIceCandidate error:', err);
            }
        };

        socket.on('webrtc_offer',         handleOffer);
        socket.on('webrtc_answer',        handleAnswer);
        socket.on('webrtc_ice_candidate', handleIceCandidate);

        return () => {
            socket.off('webrtc_offer',         handleOffer);
            socket.off('webrtc_answer',        handleAnswer);
            socket.off('webrtc_ice_candidate', handleIceCandidate);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomId, createPeerConnection]);

    // Cleanup when socket disconnects
    useEffect(() => {
        if (!isConnected && isVoiceActive) {
            cleanupWebRTC();
            setIsVoiceActive(false);
        }
        return cleanupWebRTC;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConnected]);

    // ── Actions ───────────────────────────────────────────────────────────────

    const toggleVoice = async (e) => {
        if (e) e.stopPropagation();

        if (isVoiceActive) {
            cleanupWebRTC();
            setIsVoiceActive(false);
            socket.emit('toggle_voice', { roomId, isVoiceActive: false, isMuted: true });
        } else {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                localStreamRef.current = stream;
                stream.getAudioTracks()[0].enabled = !isMuted;
                setIsVoiceActive(true);
                setIsExpanded(true);
                socket.emit('toggle_voice', { roomId, isVoiceActive: true, isMuted });

                // Create offers for everyone already in voice
                const others = users.filter(u => u.isVoiceActive && u.id !== currentUser?.id);
                for (const user of others) {
                    createPeerConnection(user.id, true);
                }
            } catch (err) {
                console.error('[Voice] getUserMedia failed:', err);
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    alert('Microphone permission denied. Please allow microphone access in your browser settings and try again.');
                } else if (err.name === 'NotFoundError') {
                    alert('No microphone found. Please connect a microphone and try again.');
                } else {
                    alert('Could not access microphone: ' + err.message);
                }
            }
        }
    };

    const toggleMute = (e) => {
        if (e) e.stopPropagation();
        if (!localStreamRef.current) return;
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (!audioTrack) return;
        const nextMuted = !isMuted;
        audioTrack.enabled = !nextMuted;
        setIsMuted(nextMuted);
        socket.emit('toggle_voice', { roomId, isVoiceActive, isMuted: nextMuted });
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="mb-2 glass-panel rounded-2xl overflow-hidden shrink-0"
            style={{ backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}>
            <button
                onClick={() => setIsExpanded(v => !v)}
                className="flex items-center justify-between w-full px-4 py-3 hover:brightness-110 transition-all"
            >
                <div className="flex items-center gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold syne" style={{ color: 'var(--text)' }}>
                        <Phone size={14} style={{ color: isVoiceActive ? '#4ade80' : 'var(--accent)' }} />
                        Voice Lounge
                        <span className="text-xs px-1.5 py-0.5 rounded-full"
                            style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>
                            {voiceUsers.length}
                        </span>
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    {isVoiceActive ? (
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={toggleMute}
                                className={`p-1 rounded-lg transition-all ${isMuted
                                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                                    : 'bg-gray-500/20 text-gray-300 hover:bg-gray-500/30'}`}
                                title={isMuted ? 'Unmute' : 'Mute'}
                            >
                                {isMuted ? <MicOff size={13} /> : <Mic size={13} />}
                            </button>
                            <button
                                onClick={toggleVoice}
                                className="p-1 rounded-lg transition-all bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                title="Leave Voice"
                            >
                                <PhoneOff size={13} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={toggleVoice}
                            className="text-xs font-semibold px-2 py-1 rounded transition-all bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20"
                        >
                            Join
                        </button>
                    )}
                    {isExpanded
                        ? <ChevronUp size={13} style={{ color: 'var(--text-muted)' }} />
                        : <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />}
                </div>
            </button>

            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div key="voice-body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        className="overflow-hidden"
                        style={{ borderTop: '1px solid var(--glass-border)' }}>
                        <div className="p-3 max-h-40 overflow-y-auto custom-scrollbar">
                            {voiceUsers.length === 0 ? (
                                <div className="w-full text-center py-4 text-xs text-gray-500">
                                    No one is in voice.
                                </div>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    <AnimatePresence>
                                        {voiceUsers.map(user => (
                                            <motion.div
                                                key={user.id}
                                                initial={{ opacity: 0, scale: 0.8 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.8 }}
                                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border ${
                                                    user.isMuted
                                                        ? 'border-white/5 bg-white/5'
                                                        : 'border-green-500/30 bg-green-500/10'
                                                }`}
                                            >
                                                <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-[10px] text-white">
                                                    {user.nickname.charAt(0).toUpperCase()}
                                                </div>
                                                <span className="max-w-[80px] truncate" style={{ color: 'var(--text)' }}>
                                                    {user.nickname} {user.id === currentUser?.id ? '(You)' : ''}
                                                </span>
                                                {user.isMuted && <MicOff size={10} className="text-red-400 ml-1" />}
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default VoiceRoom;
