import React, { useRef, useEffect, useState, useCallback } from 'react';
import ReactPlayer from 'react-player/lazy';
import { useRoom } from '../context/RoomContext';
import { Play, Lock, Upload, AlertCircle, Plus, ChevronDown, Mic, Subtitles as SubtitlesIcon, StopCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useTheme } from '../context/ThemeContext';

// How often the host reports playback position to the server (ms)
const SYNC_INTERVAL_MS = 2000;
// Maximum drift allowed before viewers auto-seek (seconds)
const DRIFT_THRESHOLD = 2;

const VideoPlayer = () => {
    const { videoState, currentUser, loadVideo, addToQueue, playVideo, pauseVideo, syncProgress,
        remoteStream, isHostStreaming, startLocalStream, stopLocalStream, getHostStreamer } = useRoom();
    const { theme, setAdaptiveColor } = useTheme();

    // Refs
    const playerRef = useRef(null);
    const webrtcVideoRef = useRef(null); // <video> element that renders remote stream (viewer)
    const fileInputRef = useRef(null);
    const subtitleInputRef = useRef(null);
    const syncIntervalRef = useRef(null);

    // State
    const [inputUrl, setInputUrl] = useState('');
    const [isPlayerReady, setIsPlayerReady] = useState(false);
    const [playerError, setPlayerError] = useState(null);
    const [hostBlobUrl, setHostBlobUrl] = useState('');  // blob URL for host's local file preview
    const hostVideoRef = useRef(null);                   // <video> ref for host preview (also captureStream source)

    // Tracks
    const [subtitleTracks, setSubtitleTracks] = useState([]); // [{label, kind, srcLang, src}]
    const [audioTracks, setAudioTracks] = useState([]);       // [{label, index}]
    const [activeSubtitle, setActiveSubtitle] = useState(-1); // -1 = off
    const [activeAudio, setActiveAudio] = useState(0);
    const [showSubMenu, setShowSubMenu] = useState(false);
    const [showAudioMenu, setShowAudioMenu] = useState(false);

    const isPrivileged = currentUser?.role === 'Host' || currentUser?.role === 'Moderator';

    // Seek guard: true while user is scrubbing — prevents onPlay/onPause oscillation
    const isSeekingRef = useRef(false);
    const seekEndTimerRef = useRef(null);
    // Debounce timers for play/pause so seeking (which fires pause then play) doesn't emit rapidly
    const playDebounceRef = useRef(null);
    const pauseDebounceRef = useRef(null);
    // Local tracking of last position we synced, so onProgress doesn't re-trigger immediately after sync
    const lastSyncedPosRef = useRef(0);

    // ─── 1. Reset state on URL/magnetURI change ───────────────────────────────
    useEffect(() => {
        setIsPlayerReady(false);
        setPlayerError(null);
        setSubtitleTracks([]);
        setAudioTracks([]);
        setActiveSubtitle(-1);
        setActiveAudio(0);
    }, [videoState.url, videoState.magnetURI]);

    // ─── 2. WebRTC viewer: assign remote stream to video element ──────────────
    useEffect(() => {
        if (!remoteStream || !webrtcVideoRef.current) return;
        webrtcVideoRef.current.srcObject = remoteStream;
        webrtcVideoRef.current.play().catch(() => { });
        setIsPlayerReady(true);
    }, [remoteStream]);

    // ─── 3. WebRTC viewer: sync play/pause on the remote video element ────────
    useEffect(() => {
        if (!remoteStream || !webrtcVideoRef.current || !isPlayerReady) return;
        const video = webrtcVideoRef.current;
        if (videoState.isPlaying) {
            video.play().catch(() => { });
        } else {
            if (!isSeekingRef.current) video.pause();
        }
    }, [videoState.isPlaying, remoteStream, isPlayerReady]);

    // ─── 4. WebRTC viewer: drift correction ──────────────────────────────────
    useEffect(() => {
        if (!isPlayerReady || isPrivileged || !remoteStream || !webrtcVideoRef.current) return;
        const stateTime = videoState.playedSeconds || 0;
        const internalTime = webrtcVideoRef.current.currentTime || 0;
        if (Math.abs(internalTime - stateTime) > DRIFT_THRESHOLD) {
            webrtcVideoRef.current.currentTime = stateTime;
        }
    }, [videoState.playedSeconds, videoState.updatedAt, isPlayerReady, isPrivileged, remoteStream]);


    // ─── 5a. Start WebRTC captureStream once host video element is rendered ───────
    useEffect(() => {
        if (!hostBlobUrl || !hostVideoRef.current || !isPrivileged) return;
        // Video element just rendered with the blob URL — start the WebRTC stream
        const el = hostVideoRef.current;
        toast.loading('Starting stream...', { id: 'webrtc-toast' });
        startLocalStream(el)
            .then(() => toast.success('\ud83d\udce1 Streaming to viewers via WebRTC!', { id: 'webrtc-toast' }))
            .catch(err => {
                toast.error(`Stream failed: ${err.message}`, { id: 'webrtc-toast' });
                setHostBlobUrl('');
            });
        // Note: startLocalStream only needs to run once per blob URL
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hostBlobUrl]);

    // ─── Host video cleanup on unmount ─────────────────────────────────────
    useEffect(() => {
        return () => { if (hostBlobUrl) URL.revokeObjectURL(hostBlobUrl); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── 4. ReactPlayer Events (Host & URL Viewers) ─────────────────────────────
    const handleReady = useCallback(() => {
        setIsPlayerReady(true);
        setPlayerError(null);

        // Late-join seeker
        const stateTime = videoState.playedSeconds || 0;
        if (stateTime > 2 && playerRef.current) {
            playerRef.current.seekTo(stateTime, 'seconds');
        }

        // Native track detection
        const internal = playerRef.current?.getInternalPlayer?.();
        if (internal instanceof HTMLVideoElement) {
            const tTracks = [...(internal.textTracks || [])].map((t, i) => ({
                label: t.label || t.language || `Track ${i + 1}`,
                language: t.language,
                kind: t.kind,
                index: i,
                isNative: true // Flag to distinguish from manually uploaded
            }));

            const aTracks = [...(internal.audioTracks || [])].map((t, i) => ({
                label: t.label || t.language || `Audio ${i + 1}`,
                language: t.language,
                index: i,
            }));

            // Only overwrite if we haven't manually uploaded subtitles
            setSubtitleTracks(prev => prev.some(t => !t.isNative) ? prev : tTracks);
            if (aTracks.length > 0) setAudioTracks(aTracks);
        }
    }, [videoState.playedSeconds]);

    // Host reports progress
    useEffect(() => {
        if (!isPrivileged) return;

        syncIntervalRef.current = setInterval(() => {
            if (isSeekingRef.current) return;
            // Host WebRTC stream: get time from the hidden source video via getHostStreamer()
            const streamer = getHostStreamer();
            const t = streamer
                ? streamer.getCurrentTime()
                : (playerRef.current?.getCurrentTime?.() || 0);
            if (t > 0) syncProgress(t);
        }, SYNC_INTERVAL_MS);

        return () => clearInterval(syncIntervalRef.current);
    }, [isPrivileged, syncProgress, isHostStreaming, getHostStreamer]);

    // Apply active subtitle track
    useEffect(() => {
        const internal = webrtcVideoRef.current || playerRef.current?.getInternalPlayer?.();
        if (!(internal instanceof HTMLVideoElement) || !internal.textTracks) return;
        [...internal.textTracks].forEach((track, i) => {
            track.mode = i === activeSubtitle ? 'showing' : 'hidden';
        });
    }, [activeSubtitle, remoteStream]);

    // Apply active audio track
    useEffect(() => {
        const internal = webrtcVideoRef.current || playerRef.current?.getInternalPlayer?.();
        if (!(internal instanceof HTMLVideoElement) || !internal.audioTracks) return;
        [...internal.audioTracks].forEach((track, i) => {
            track.enabled = i === activeAudio;
        });
    }, [activeAudio, remoteStream]);

    // ─── Adaptive Color Extraction ────────────────────────────────────────────
    useEffect(() => {
        // Only run if theme is adaptive and player is ready
        if (theme !== 'adaptive' || !isPlayerReady) return;

        const internal = webrtcVideoRef.current || playerRef.current?.getInternalPlayer?.('video');

        const interval = setInterval(() => {
            try {
                if (internal instanceof HTMLVideoElement && internal.videoWidth) {
                    const canvas = document.createElement('canvas');
                    canvas.width = 1;
                    canvas.height = 1;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    ctx.drawImage(internal, 0, 0, 1, 1);
                    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
                    if (r > 10 || g > 10 || b > 10) {
                        setAdaptiveColor(`rgba(${r}, ${g}, ${b}, 0.5)`);
                    }
                }
            } catch (_) { }
        }, 5000);

        return () => clearInterval(interval);
    }, [theme, isPlayerReady, remoteStream, setAdaptiveColor, isHostStreaming]);

    // ─── 5. Uploads & Controls ────────────────────────────────────────────────
    const handleLoad = (e) => {
        e.preventDefault();
        if (!isPrivileged || !inputUrl.trim()) return;
        setPlayerError(null);
        // If streaming a local file, stop it first
        if (isHostStreaming) handleStopStream();
        loadVideo(inputUrl.trim());
        setInputUrl('');
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file || !isPrivileged) return;
        e.target.value = '';
        setPlayerError(null);
        // Stop any previous local stream
        if (isHostStreaming) handleStopStream();
        // Create a blob URL — rendering a <video src={blobUrl}> will trigger captureStream
        if (hostBlobUrl) URL.revokeObjectURL(hostBlobUrl);
        setHostBlobUrl(URL.createObjectURL(file));
        // Clear any URL-based video
        if (videoState.url) loadVideo('');
    };

    const handleStopStream = () => {
        stopLocalStream();
        if (hostBlobUrl) { URL.revokeObjectURL(hostBlobUrl); setHostBlobUrl(''); }
    };

    const handleSubtitleUpload = (e) => {
        const files = [...e.target.files];
        if (!files.length) return;
        e.target.value = '';

        const tracks = files.map((file, i) => ({
            kind: 'subtitles',
            src: URL.createObjectURL(file),
            srcLang: `track${i}`,
            label: file.name.replace(/\.[^.]+$/, ''),
            default: i === 0,
            isNative: false,
            index: subtitleTracks.length + i // append to existing
        }));

        setSubtitleTracks(prev => [...prev.filter(t => t.isNative), ...tracks]);
        setActiveSubtitle(tracks[0].index);
        toast.success(`Loaded ${files.length} subtitle track(s)`, { icon: '🗒️' });
    };

    // Render helpers
    const playerUrl = videoState.url || null;
    const isWebRTCViewer = !!remoteStream && !isPrivileged;
    const isWebRTCHost = isHostStreaming && isPrivileged;
    const showHostPreview = isPrivileged && !!hostBlobUrl;  // show host's local video
    // hasContent: URL video, or WebRTC stream (host/viewer), or viewer waiting for stream
    const hasContent = !!(playerUrl || isWebRTCViewer || showHostPreview
        || (videoState.magnetURI === 'local' && !isPrivileged));

    // Spotify link parsing
    let isSpotify = false;
    let spotifyEmbedUrl = '';
    if (playerUrl && playerUrl.includes('spotify.com')) {
        isSpotify = true;
        const match = playerUrl.match(/spotify\.com\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/);
        if (match) {
            spotifyEmbedUrl = `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator&theme=${theme === 'light' ? '0' : '1'}`;
        }
    }

    const SubtitleMenu = () => (
        <div className="relative">
            <button onClick={() => { setShowSubMenu(p => !p); setShowAudioMenu(false); }}
                className="flex items-center gap-1.5 px-3 py-1 text-xs text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded-lg hover:bg-purple-500/20 transition-colors">
                <SubtitlesIcon size={13} />
                {activeSubtitle === -1 ? 'Subs Off' : (subtitleTracks.find(t => t.index === activeSubtitle)?.label || `Track ${activeSubtitle + 1}`)}
                <ChevronDown size={11} />
            </button>
            <AnimatePresence>
                {showSubMenu && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        className="absolute top-full left-0 mt-1 bg-zinc-800 border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden min-w-40">
                        <button onClick={() => { setActiveSubtitle(-1); setShowSubMenu(false); }}
                            className={`w-full px-3 py-2 text-left text-xs hover:bg-white/5 ${activeSubtitle === -1 ? 'text-purple-400' : 'text-gray-300'}`}>
                            Off
                        </button>
                        {subtitleTracks.map(t => (
                            <button key={t.index} onClick={() => { setActiveSubtitle(t.index); setShowSubMenu(false); }}
                                className={`w-full px-3 py-2 text-left text-xs hover:bg-white/5 ${activeSubtitle === t.index ? 'text-purple-400' : 'text-gray-300'}`}>
                                {t.label}{t.language ? ` (${t.language})` : ''}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );

    const AudioMenu = () => (
        <div className="relative">
            <button onClick={() => { setShowAudioMenu(p => !p); setShowSubMenu(false); }}
                className="flex items-center gap-1.5 px-3 py-1 text-xs text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-colors">
                <Mic size={13} />
                {audioTracks.find(t => t.index === activeAudio)?.label || `Audio ${activeAudio + 1}`}
                <ChevronDown size={11} />
            </button>
            <AnimatePresence>
                {showAudioMenu && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        className="absolute top-full left-0 mt-1 bg-zinc-800 border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden min-w-40">
                        {audioTracks.map(t => (
                            <button key={t.index} onClick={() => { setActiveAudio(t.index); setShowAudioMenu(false); }}
                                className={`w-full px-3 py-2 text-left text-xs hover:bg-white/5 ${activeAudio === t.index ? 'text-blue-400' : 'text-gray-300'}`}>
                                {t.label}{t.language ? ` (${t.language})` : ''}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );

    return (
        <div className="flex flex-col h-full w-full gap-2">
            {/* ── Control Bar (Host/Mod only) ─────────────────────────── */}
            {isPrivileged && (
                <div className="flex gap-2 flex-shrink-0 flex-wrap">
                    <form onSubmit={handleLoad} className="flex gap-2 flex-1 min-w-0">
                        <div className="relative flex-1 min-w-0">
                            <input
                                type="text"
                                value={inputUrl}
                                onChange={e => setInputUrl(e.target.value)}
                                placeholder="YouTube, Vimeo, Spotify URL, or video link..."
                                className="w-full rounded-xl py-2 pl-4 pr-4 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                                style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', color: 'var(--text-color)' }}
                            />
                        </div>
                        <button type="submit" disabled={!inputUrl.trim()} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-colors">Load</button>
                        <button type="button" disabled={!inputUrl.trim()} onClick={() => { addToQueue(inputUrl.trim(), '', inputUrl.trim()); toast.success('Added to queue'); setInputUrl(''); }} className="px-3 py-2 text-gray-300 border border-white/10 rounded-xl text-sm font-medium flex items-center gap-1.5 hover:bg-white/5 transition-colors" style={{ background: 'var(--panel-bg)' }}><Plus size={14} /> Queue</button>
                    </form>
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3 py-2 text-gray-300 border border-white/10 rounded-xl text-sm font-medium flex items-center gap-1.5 hover:bg-white/5 transition-colors" style={{ background: 'var(--panel-bg)' }}><Upload size={16} /> File</button>
                    <input type="file" ref={fileInputRef} className="hidden" accept="video/*,audio/*" onChange={handleFileUpload} />
                    {/* Streaming indicator pill */}
                    {isWebRTCHost && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/30">
                            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                            <span className="text-xs text-green-300 font-medium">Live</span>
                            <button onClick={handleStopStream} className="ml-1 flex items-center gap-1 px-2 py-0.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded-lg text-xs transition-colors">
                                <StopCircle size={11} /> Stop
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ── Track toolbar ─────────────────────────────────────── */}
            {hasContent && !isSpotify && (
                <div className="flex gap-3 items-center flex-shrink-0 flex-wrap p-2 rounded-xl" style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)' }}>
                    <span className="text-xs font-semibold text-gray-400">Tracks:</span>
                    {subtitleTracks.length > 0 && <SubtitleMenu />}
                    {audioTracks.length > 0 && <AudioMenu />}

                    {isPrivileged && (
                        <>
                            <div className="w-px h-4 bg-white/10 mx-1" />
                            <button onClick={() => subtitleInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1 text-xs text-gray-300 border border-white/10 rounded-lg transition-colors hover:bg-white/5" style={{ background: 'var(--panel-bg)' }}>
                                <Plus size={12} /> Add Subs (.vtt, .srt)
                            </button>
                            <input type="file" ref={subtitleInputRef} className="hidden" accept=".vtt,.srt,.ass,.ssa" multiple onChange={handleSubtitleUpload} />
                        </>
                    )}

                    {(isWebRTCHost || isWebRTCViewer) && subtitleTracks.length === 0 && audioTracks.length === 0 && isPlayerReady && (
                        <span className="text-xs text-yellow-500/80 italic hidden sm:block">
                            (Note: Browsers cannot read MKV embedded tracks natively. Please upload subtitles manually).
                        </span>
                    )}
                </div>
            )}

            {/* ── Player ───────────────────────────────────────────── */}
            <div className="flex-1 rounded-2xl overflow-hidden border border-white/10 relative group min-h-0" style={{ background: '#000' }}>
                <AnimatePresence mode="wait">
                    {!hasContent ? (
                        <motion.div key="empty" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                            <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6 ring-4 ring-white/5 animate-pulse"><Play size={32} className="text-gray-400 ml-2" /></div>
                            <h2 className="text-xl font-semibold mb-2 text-gray-200">No Video Playing</h2>
                            <p className="text-gray-400 max-w-sm text-sm">{isPrivileged ? 'Paste a URL and click Load, or upload a local file.' : 'Waiting for the host to start a video.'}</p>
                        </motion.div>
                    ) : (
                        <motion.div key="player" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 w-full h-full">

                            {/* Host: local file video preview (also the captureStream source) */}
                            {showHostPreview && (
                                <div className="absolute inset-0 bg-black">
                                    <video
                                        ref={hostVideoRef}
                                        src={hostBlobUrl}
                                        className="w-full h-full object-contain"
                                        autoPlay
                                        controls
                                        playsInline
                                        onPlay={() => { if (isPrivileged) playVideo(); }}
                                        onPause={() => { if (isPrivileged && hostVideoRef.current) pauseVideo(hostVideoRef.current.currentTime); }}
                                        onSeeked={() => { const t = hostVideoRef.current?.currentTime || 0; if (isPrivileged) { seekVideo(t); syncProgress(t); } }}
                                        onTimeUpdate={() => { const t = hostVideoRef.current?.currentTime || 0; if (t > 0 && !isSeekingRef.current && isPrivileged) syncProgress(t); }}
                                    />
                                </div>
                            )}
                            {/* Viewer: WebRTC connecting spinner */}
                            {isWebRTCViewer && !isPlayerReady && !playerError && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/90 text-center p-6">
                                    <div className="w-16 h-16 rounded-full border-4 border-purple-500 border-t-transparent animate-spin mb-6" />
                                    <h2 className="text-lg font-semibold mb-1 text-gray-200">Connecting to Host</h2>
                                    <p className="text-gray-400 text-sm">Waiting for WebRTC stream from host...</p>
                                </div>
                            )}

                            {/* Viewer: WebRTC remote stream video */}
                            {isWebRTCViewer && (
                                <div className={`absolute inset-0 bg-black flex flex-col justify-center items-center ${isPlayerReady ? 'opacity-100' : 'opacity-0'}`}>
                                    <video
                                        ref={webrtcVideoRef}
                                        className="w-full h-full object-contain"
                                        autoPlay
                                        playsInline
                                        controls={false}
                                    />
                                </div>
                            )}

                            {/* Spotify Full Room Player */}
                            {isSpotify && spotifyEmbedUrl && (
                                <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center p-6 gap-4"
                                    style={{ background: 'linear-gradient(135deg, #1DB954/10, #191414 60%)' }}>

                                    {/* Header */}
                                    <div className="flex items-center gap-2 text-green-400 shrink-0">
                                        {/* Spotify logo SVG */}
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" /></svg>
                                        <span className="font-bold text-sm tracking-wide">Spotify — Music Room</span>
                                    </div>

                                    {/* Spotify Embed - full width */}
                                    <iframe
                                        style={{ borderRadius: '12px' }}
                                        src={spotifyEmbedUrl}
                                        width="100%"
                                        height="100%"
                                        frameBorder="0"
                                        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                                        loading="lazy"
                                        className="flex-1 min-h-0 shadow-2xl"
                                    />

                                    {/* Sync tip */}
                                    <div className="shrink-0 flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full border border-white/10">
                                        <span className="text-xs text-gray-400">🎵 Everyone sees this player — press play at the same time to listen together</span>
                                    </div>
                                </div>
                            )}

                            {/* ReactPlayer for URL-based content (not WebRTC viewer or Spotify) */}
                            {!isWebRTCViewer && !isSpotify && playerUrl && (
                                <ReactPlayer
                                    ref={playerRef}
                                    key={playerUrl}
                                    url={playerUrl}
                                    playing={videoState.isPlaying}
                                    controls={isPrivileged}
                                    width="100%"
                                    height="100%"
                                    onReady={handleReady}
                                    onPlay={() => {
                                        if (!isPrivileged) return;
                                        // Cancel any pending pause and schedule play — if seek follows, onSeek will cancel this
                                        clearTimeout(pauseDebounceRef.current);
                                        clearTimeout(playDebounceRef.current);
                                        playDebounceRef.current = setTimeout(() => {
                                            if (!isSeekingRef.current) playVideo();
                                        }, 250);
                                    }}
                                    onPause={() => {
                                        if (!isPrivileged) return;
                                        // Delay pause emit — if onSeek fires within 250ms, this gets cancelled
                                        clearTimeout(playDebounceRef.current);
                                        clearTimeout(pauseDebounceRef.current);
                                        pauseDebounceRef.current = setTimeout(() => {
                                            if (!isSeekingRef.current) pauseVideo(playerRef.current?.getCurrentTime() || 0);
                                        }, 250);
                                    }}
                                    onSeek={() => {
                                        // Cancel pending play/pause debounces immediately — seeking is in progress
                                        clearTimeout(playDebounceRef.current);
                                        clearTimeout(pauseDebounceRef.current);
                                        isSeekingRef.current = true;
                                        clearTimeout(seekEndTimerRef.current);
                                        seekEndTimerRef.current = setTimeout(() => {
                                            isSeekingRef.current = false;
                                            const t = playerRef.current?.getCurrentTime?.() || 0;
                                            lastSyncedPosRef.current = t;
                                            if (isPrivileged) syncProgress(t);
                                        }, 400);
                                    }}
                                    onError={() => setPlayerError('Could not load video.')}
                                    progressInterval={1000}
                                    onProgress={(p) => {
                                        // Only host, only when NOT actively seeking, only if drift is still large vs last known sync
                                        if (
                                            isPrivileged &&
                                            !isSeekingRef.current &&
                                            Math.abs(p.playedSeconds - lastSyncedPosRef.current) > SYNC_INTERVAL_MS / 1000 + 1
                                        ) {
                                            lastSyncedPosRef.current = p.playedSeconds;
                                            syncProgress(p.playedSeconds);
                                        }
                                    }}
                                    config={{
                                        youtube: { playerVars: { disablekb: isPrivileged ? 0 : 1, modestbranding: 1, autoplay: 1, mute: isPrivileged ? 0 : 0 } },
                                        file: { attributes: { preload: 'auto', crossOrigin: 'anonymous' }, tracks: subtitleTracks.filter(t => !t.isNative).map(t => ({ kind: 'subtitles', src: t.src, srcLang: t.srcLang, label: t.label, default: t.default })) }
                                    }}
                                />
                            )}

                            {/* Error Overlay */}
                            {playerError && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/90">
                                    <AlertCircle size={40} className="text-red-400 mb-4" />
                                    <p className="text-gray-300 text-sm">{playerError}</p>
                                </div>
                            )}

                            {/* Viewer Lock Info */}
                            {!isPrivileged && (
                                <div className="absolute top-3 right-3 bg-black/70 backdrop-blur px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-30 pointer-events-none">
                                    <Lock size={12} className="text-gray-400" />
                                    <span className="text-xs text-gray-300">Synced to host</span>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default VideoPlayer;
