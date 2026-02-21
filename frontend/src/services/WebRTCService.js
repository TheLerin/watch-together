/**
 * WebRTCService.js
 * Handles WebRTC peer connections for local video streaming.
 *
 * HOST: loads file → captureStream() → streams to each viewer via RTCPeerConnection
 * VIEWER: receives remote MediaStream → plays in <video>
 *
 * Backend (Socket.IO) is used ONLY for signaling (offer/answer/ICE candidates).
 * No video data ever passes through the server.
 */

const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
];

// ─── HOST SIDE ────────────────────────────────────────────────────────────────

export class HostStreamer {
    constructor(socket, roomId) {
        this.socket = socket;
        this.roomId = roomId;
        this.peers = new Map();      // viewerSocketId → RTCPeerConnection
        this.stream = null;          // MediaStream from captureStream()
        this.sourceVideo = null;     // Hidden <video> element
        this.blobUrl = null;
    }

    /**
     * Attach to an already-rendered <video> element and start streaming it to viewers.
     * The VideoPlayer manages the element's src/playback; we just capture its stream.
     * @param {HTMLVideoElement} videoEl  - the visible <video> rendered by VideoPlayer
     * @param {string[]} viewerSocketIds
     */
    async start(videoEl, viewerSocketIds) {
        if (!videoEl) throw new Error('videoEl is required');

        this.sourceVideo = videoEl;

        // Capture the playing video as a MediaStream
        if (typeof videoEl.captureStream === 'function') {
            this.stream = videoEl.captureStream();
        } else if (typeof videoEl.mozCaptureStream === 'function') {
            this.stream = videoEl.mozCaptureStream();
        } else {
            throw new Error('captureStream() is not supported in this browser.');
        }

        // Offer to all current viewers
        for (const viewerId of viewerSocketIds) {
            await this._createOffer(viewerId);
        }
    }

    /** Call when a new viewer joins while host is already streaming */
    async addViewer(viewerSocketId) {
        if (!this.stream) return;
        await this._createOffer(viewerSocketId);
    }

    async _createOffer(viewerSocketId) {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        this.peers.set(viewerSocketId, pc);

        // Add all tracks from the captured stream
        for (const track of this.stream.getTracks()) {
            pc.addTrack(track, this.stream);
        }

        // ICE candidates → relay via socket to that viewer
        pc.onicecandidate = (e) => {
            if (e.candidate) {
                this.socket.emit('webrtc_ice_candidate', {
                    roomId: this.roomId,
                    targetId: viewerSocketId,
                    candidate: e.candidate,
                });
            }
        };

        pc.onconnectionstatechange = () => {
            console.log(`[HostStreamer] ${viewerSocketId} state: ${pc.connectionState}`);
            if (pc.connectionState === 'failed') {
                pc.restartIce();
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        this.socket.emit('webrtc_offer', {
            roomId: this.roomId,
            targetId: viewerSocketId,
            sdp: pc.localDescription,
        });
    }

    /** Handle answer from a viewer */
    async handleAnswer(viewerSocketId, sdp) {
        const pc = this.peers.get(viewerSocketId);
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }

    /** Handle ICE candidate from a viewer */
    async handleIceCandidate(viewerSocketId, candidate) {
        const pc = this.peers.get(viewerSocketId);
        if (!pc) return;
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (_) { }
    }

    /** Seek the source video (called by VideoPlayer) */
    seekTo(seconds) {
        if (this.sourceVideo) this.sourceVideo.currentTime = seconds;
    }

    getCurrentTime() {
        return this.sourceVideo ? this.sourceVideo.currentTime : 0;
    }

    play() {
        return this.sourceVideo?.play().catch(() => { });
    }

    pause() {
        this.sourceVideo?.pause();
    }

    setVolume(v) {
        if (this.sourceVideo) this.sourceVideo.volume = v;
    }

    removeViewer(viewerSocketId) {
        const pc = this.peers.get(viewerSocketId);
        if (pc) { pc.close(); this.peers.delete(viewerSocketId); }
    }

    stop() {
        for (const pc of this.peers.values()) pc.close();
        this.peers.clear();
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        // NOTE: sourceVideo and blobUrl are owned by VideoPlayer — don't touch them here
        this.sourceVideo = null;
    }
}

// ─── VIEWER SIDE ──────────────────────────────────────────────────────────────

export class ViewerReceiver {
    constructor(socket, roomId) {
        this.socket = socket;
        this.roomId = roomId;
        this.pc = null;
        this.onStreamCallback = null;
    }

    /** Handle incoming offer from host */
    async handleOffer(hostSocketId, sdp) {
        this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

        this.pc.ontrack = (e) => {
            if (this.onStreamCallback) {
                this.onStreamCallback(e.streams[0]);
            }
        };

        this.pc.onicecandidate = (e) => {
            if (e.candidate) {
                this.socket.emit('webrtc_ice_candidate', {
                    roomId: this.roomId,
                    targetId: hostSocketId,
                    candidate: e.candidate,
                });
            }
        };

        this.pc.onconnectionstatechange = () => {
            console.log(`[ViewerReceiver] state: ${this.pc.connectionState}`);
        };

        await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);

        this.socket.emit('webrtc_answer', {
            roomId: this.roomId,
            targetId: hostSocketId,
            sdp: this.pc.localDescription,
        });
    }

    onStream(callback) {
        this.onStreamCallback = callback;
    }

    async handleIceCandidate(candidate) {
        if (!this.pc) return;
        try {
            await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (_) { }
    }

    stop() {
        if (this.pc) { this.pc.close(); this.pc = null; }
    }
}
