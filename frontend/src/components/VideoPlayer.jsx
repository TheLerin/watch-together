import React, { useRef, useEffect, useState, useCallback } from 'react';
import ReactPlayer from 'react-player/lazy';
import { useRoom } from '../context/RoomContext';
import { Play, Link as LinkIcon, Lock, Upload, AlertCircle, Plus, ChevronDown, Mic, Subtitles as SubtitlesIcon } from 'lucide-react';
import { getTorrentClient } from '../torrentClient';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useTheme } from '../context/ThemeContext';

// How often the host reports playback position to the server (ms)
const SYNC_INTERVAL_MS = 2000; // Faster sync (was 4000)
// Maximum drift allowed before viewers auto-seek (seconds)
const DRIFT_THRESHOLD = 2; // Tighter sync (was 3)
// Public WebTorrent Trackers (works on Vercel/Render, no backend required)
const PUBLIC_TRACKERS = [
    'wss://tracker.openwebtorrent.com',
    'wss://tracker.btorrent.xyz',
    'wss://tracker.fastcast.nz'
];

const VideoPlayer = () => {
    const { videoState, currentUser, loadVideo, addToQueue, playVideo, pauseVideo, syncProgress } = useRoom();
    const { theme, setAdaptiveColor } = useTheme();

    // Refs
    const playerRef = useRef(null);
    const p2pVideoRef = useRef(null); // Used only for P2P viewers (renderTo target)
    const fileInputRef = useRef(null);
    const subtitleInputRef = useRef(null);
    const syncIntervalRef = useRef(null);

    // State
    const [inputUrl, setInputUrl] = useState('');
    const [isPlayerReady, setIsPlayerReady] = useState(false);
    const [localStreamUrl, setLocalStreamUrl] = useState('');     // Object URL for host uploaded file
    const p2pFileRef = useRef(null);       // WebTorrent file ref for Viewer (NOT in state — state strips prototype!)
    const [p2pVideoFile, setP2pVideoFile] = useState(null);       // Boolean flag — true when P2P file is ready
    const [torrentProgress, setTorrentProgress] = useState(0);
    const [playerError, setPlayerError] = useState(null);

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

    // ─── 1. Reset state on URL change ────────────────────────────────────────
    useEffect(() => {
        setIsPlayerReady(false);
        setPlayerError(null);
        setSubtitleTracks([]);
        setAudioTracks([]);
        setActiveSubtitle(-1);
        setActiveAudio(0);

        // If we switched off a local file/P2P
        if (videoState.url && !videoState.magnetURI) {
            setLocalStreamUrl('');
            setP2pVideoFile(null);
            setTorrentProgress(0);
        }
        if (!videoState.url && !videoState.magnetURI) {
            setLocalStreamUrl('');
            setP2pVideoFile(null);
            setTorrentProgress(0);
        }
    }, [videoState.url, videoState.magnetURI]);

    // ─── 2. Viewer P2P: Stream torrent instantly via renderTo ─────────────────
    useEffect(() => {
        if (!videoState.magnetURI || isPrivileged) return;
        setPlayerError(null);
        p2pFileRef.current = null;
        setP2pVideoFile(false); // reset flag

        const client = getTorrentClient();
        let addedByUs = false;

        const onReady = (t) => {
            if (typeof t.on === 'function') {
                t.on('download', () => setTorrentProgress(t.progress));
            }
            setTorrentProgress(t.progress);

            if (t.files?.length > 0) {
                console.log('P2P file detected:', t.files[0].name);
                // Store the real object in a ref, NOT in state (state serialization strips methods)
                p2pFileRef.current = t.files[0];
                setP2pVideoFile(true); // trigger re-render so the useEffect below can run renderTo
            }
        };

        const existing = client.get(videoState.magnetURI);
        if (!existing) {
            addedByUs = true;
            client.add(videoState.magnetURI, { announce: PUBLIC_TRACKERS }, onReady);
        } else if (existing.ready) {
            onReady(existing);
        } else if (typeof existing.on === 'function') {
            existing.on('ready', () => onReady(existing));
        } else {
            // Stale stub — destroy and re-add
            try { client.remove(videoState.magnetURI); } catch (_) { }
            addedByUs = true;
            client.add(videoState.magnetURI, { announce: PUBLIC_TRACKERS }, onReady);
        }

        return () => {
            // Cleanup: Remove only if WE added it
            if (addedByUs) {
                try { client.remove(videoState.magnetURI); } catch (_) { }
            }
        };
    }, [videoState.magnetURI, isPrivileged]);

    // Stream P2P file using WebTorrent v2 blob() API (renderTo was removed in v2)
    useEffect(() => {
        if (!p2pVideoFile || !p2pFileRef.current || !p2pVideoRef.current || isPlayerReady) return;

        const file = p2pFileRef.current;
        let blobUrl = null;
        let cancelled = false;

        // WebTorrent v2: use file.blob() which returns a Promise<Blob>
        if (typeof file.blob === 'function') {
            console.log('P2P: Using WebTorrent v2 blob() API for streaming...');
            file.blob()
                .then(blob => {
                    if (cancelled) return;
                    blobUrl = URL.createObjectURL(blob);
                    if (p2pVideoRef.current) {
                        p2pVideoRef.current.src = blobUrl;
                        p2pVideoRef.current.autoplay = videoState.isPlaying;
                        p2pVideoRef.current.muted = false;
                        p2pVideoRef.current.load();
                        console.log('P2P: blob URL set, src =', blobUrl);
                        setIsPlayerReady(true);
                    }
                })
                .catch(err => {
                    if (cancelled) return;
                    console.error('P2P blob() error:', err);
                    setPlayerError('Failed to load P2P stream.');
                });
        } else if (typeof file.renderTo === 'function') {
            // Fallback for potential v1 builds
            const container = p2pVideoRef.current;
            container.innerHTML = '';
            file.renderTo(container, { autoplay: videoState.isPlaying, muted: false }, (err) => {
                if (cancelled) return;
                if (err) { setPlayerError('Failed to render P2P stream.'); }
                else { setIsPlayerReady(true); }
            });
        } else {
            console.error('WebTorrent File has neither blob() nor renderTo(). File:', file);
            setPlayerError('Unsupported WebTorrent version — cannot stream P2P.');
        }

        return () => {
            cancelled = true;
            // NOTE: Do NOT revoke blobUrl here — the video element still needs it.
            // It will be garbage-collected when the component fully unmounts via the cleanup below.
        };
        // IMPORTANT: Do NOT include videoState.isPlaying in this dep array!
        // If it's included, every play/pause toggle would revoke and recreate the
        // blob URL, causing ERR_FILE_NOT_FOUND after every single pause/play.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [p2pVideoFile, isPlayerReady]);

    // Sync P2P native video Play/Pause — only once the element is ready with a valid src
    useEffect(() => {
        if (!p2pVideoFile || !p2pVideoRef.current || !isPlayerReady) return;

        const video = p2pVideoRef.current;
        if (videoState.isPlaying) {
            // Guard against AbortError: check readyState before calling play()
            if (video.readyState >= 2) { // HAVE_CURRENT_DATA or better
                video.play().catch(e => console.warn('P2P play blocked:', e));
            }
        } else {
            // Only pause if we're not in the middle of a seek (prevents oscillation)
            if (!isSeekingRef.current) video.pause();
        }
    }, [videoState.isPlaying, p2pVideoFile, isPlayerReady]);

    // ─── 3. Drift correction (sync progress to viewers) ───────────────────────
    useEffect(() => {
        if (!isPlayerReady || isPrivileged) return;
        const stateTime = videoState.playedSeconds || 0;

        let internalTime = 0;
        if (p2pFileRef.current && p2pVideoRef.current) {
            internalTime = p2pVideoRef.current.currentTime || 0;
        } else if (playerRef.current) {
            internalTime = playerRef.current.getCurrentTime() || 0;
        } else {
            return;
        }

        if (Math.abs(internalTime - stateTime) > DRIFT_THRESHOLD) {
            if (p2pFileRef.current && p2pVideoRef.current) {
                p2pVideoRef.current.currentTime = stateTime;
            } else if (playerRef.current) {
                playerRef.current.seekTo(stateTime, 'seconds');
            }
        }
    }, [videoState.playedSeconds, videoState.updatedAt, isPlayerReady, isPrivileged, p2pVideoFile]);

    // ─── 4. ReactPlayer Events (Host & URL Viewers) ───────────────────────────
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
        if (!playerRef.current && !p2pVideoRef.current) return;

        syncIntervalRef.current = setInterval(() => {
            // Skip syncing while host is actively seeking to avoid feedback loop
            if (isSeekingRef.current) return;

            const t = p2pFileRef.current
                ? (p2pVideoRef.current?.currentTime || 0)
                : (playerRef.current?.getCurrentTime?.() || 0);

            if (t > 0) syncProgress(t);
        }, SYNC_INTERVAL_MS);

        return () => clearInterval(syncIntervalRef.current);
    }, [isPrivileged, syncProgress, p2pVideoFile]);

    // Apply active tracks
    useEffect(() => {
        const internal = p2pFileRef.current ? p2pVideoRef.current : playerRef.current?.getInternalPlayer?.();
        if (!(internal instanceof HTMLVideoElement) || !internal.textTracks) return;
        [...internal.textTracks].forEach((track, i) => {
            track.mode = i === activeSubtitle ? 'showing' : 'hidden';
        });
    }, [activeSubtitle, p2pVideoFile]);

    useEffect(() => {
        const internal = p2pFileRef.current ? p2pVideoRef.current : playerRef.current?.getInternalPlayer?.();
        if (!(internal instanceof HTMLVideoElement) || !internal.audioTracks) return;
        [...internal.audioTracks].forEach((track, i) => {
            track.enabled = i === activeAudio;
        });
    }, [activeAudio, p2pVideoFile]);

    // ─── Adaptive Color Extraction ────────────────────────────────────────────
    useEffect(() => {
        // Only run if theme is adaptive and player is ready
        if (theme !== 'adaptive' || !isPlayerReady) return;

        const interval = setInterval(() => {
            try {
                const internal = p2pFileRef.current ? p2pVideoRef.current : playerRef.current?.getInternalPlayer?.('video');

                // Only works for actual HTMLVideoElements (CORS might block external sources like YouTube, but we try anyway)
                if (internal instanceof HTMLVideoElement && internal.videoWidth) {
                    const canvas = document.createElement('canvas');
                    canvas.width = 1;
                    canvas.height = 1;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    ctx.drawImage(internal, 0, 0, 1, 1);
                    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;

                    // Only update if it's not purely black or transparent (often means blocked by CORS)
                    if (r > 10 || g > 10 || b > 10) {
                        setAdaptiveColor(`rgba(${r}, ${g}, ${b}, 0.5)`);
                    }
                }
            } catch (err) {
                // Usually a CORS error (Tainted canvas) -> Do nothing, adaptive won't work for this source
            }
        }, 5000); // Check every 5s

        return () => clearInterval(interval);
    }, [theme, isPlayerReady, p2pVideoFile, setAdaptiveColor]);

    // ─── 5. Uploads & Controls ────────────────────────────────────────────────
    const handleLoad = (e) => {
        e.preventDefault();
        if (!isPrivileged || !inputUrl.trim()) return;
        setLocalStreamUrl('');
        setPlayerError(null);
        loadVideo(inputUrl.trim());
        setInputUrl('');
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file || !isPrivileged) return;
        e.target.value = '';
        setPlayerError(null);

        const blobUrl = URL.createObjectURL(file);
        setLocalStreamUrl(blobUrl);
        setTorrentProgress(1);

        toast.loading('Seeding video to public swap...', { id: 'seed-toast' });
        const client = getTorrentClient();
        client.seed(file, { announce: PUBLIC_TRACKERS }, (torrent) => {
            toast.success('Viewers can now stream from public trackers!', { id: 'seed-toast' });
            console.log('Seeding via public trackers. Magnet:', torrent.magnetURI);
            loadVideo('', torrent.magnetURI);
        });
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
    const playerUrl = localStreamUrl || videoState.url || null;
    const hasContent = !!(videoState.url || videoState.magnetURI || localStreamUrl);
    const isP2PViewer = videoState.magnetURI && !isPrivileged && !localStreamUrl;

    // Spotify link parsing
    let isSpotify = false;
    let spotifyEmbedUrl = '';
    if (playerUrl && playerUrl.includes('spotify.com')) {
        isSpotify = true;
        // Convert https://open.spotify.com/track/123 to https://open.spotify.com/embed/track/123
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
                <div className="flex gap-2 flex-shrink-0">
                    <form onSubmit={handleLoad} className="flex gap-2 flex-1">
                        <div className="relative flex-1">
                            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                            <input
                                type="text"
                                value={inputUrl}
                                onChange={e => setInputUrl(e.target.value)}
                                placeholder="YouTube, Vimeo, Spotify URL, or direct video link..."
                                className="w-full rounded-xl py-2 pl-10 pr-4 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                                style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', color: 'var(--text-color)' }}
                            />
                        </div>
                        <button type="submit" disabled={!inputUrl.trim()} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-colors">Load</button>
                        <button type="button" disabled={!inputUrl.trim()} onClick={() => { addToQueue(inputUrl.trim(), '', inputUrl.trim()); toast.success('Added to queue'); setInputUrl(''); }} className="px-3 py-2 text-gray-300 border border-white/10 rounded-xl text-sm font-medium flex items-center gap-1.5 hover:bg-white/5 transition-colors" style={{ background: 'var(--panel-bg)' }}><Plus size={14} /> Queue</button>
                    </form>
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3 py-2 text-gray-300 border border-white/10 rounded-xl text-sm font-medium flex items-center gap-1.5 hover:bg-white/5 transition-colors" style={{ background: 'var(--panel-bg)' }}><Upload size={16} /> File</button>
                    <input type="file" ref={fileInputRef} className="hidden" accept="video/*" onChange={handleFileUpload} />
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

                    {(videoState.magnetURI || localStreamUrl) && subtitleTracks.length === 0 && audioTracks.length === 0 && isPlayerReady && (
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

                            {/* Viewer P2P Loading Spinner */}
                            {videoState.magnetURI && !localStreamUrl && !playerError && !isPlayerReady && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/90 text-center p-6">
                                    <div className="w-16 h-16 rounded-full border-4 border-purple-500 border-t-transparent animate-spin mb-6" />
                                    <h2 className="text-lg font-semibold mb-1 text-gray-200">Connecting to P2P Swarm</h2>
                                    <p className="text-gray-400 text-sm mb-4">Buffering stream from host...</p>
                                    <div className="w-48 h-2 bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-purple-500 transition-all" style={{ width: `${Math.max(torrentProgress * 100, 5)}%` }} />
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">{Math.round(torrentProgress * 100)}% active</p>
                                </div>
                            )}

                            {/* Viewer P2P Native Streaming Player */}
                            {isP2PViewer && (
                                <div className={`absolute inset-0 bg-black flex flex-col justify-center items-center ${isPlayerReady ? 'opacity-100' : 'opacity-0'}`}>
                                    <video
                                        ref={p2pVideoRef}
                                        className="w-full h-full object-contain z-0"
                                        controls={false} // Viewers get no native controls
                                        playsInline
                                    >
                                        {/* Subtitle tracks for manual uploads */}
                                        {subtitleTracks.filter(t => !t.isNative).map(t => (
                                            <track key={t.index} kind="subtitles" src={t.src} srcLang={t.srcLang} label={t.label} default={t.default} />
                                        ))}
                                    </video>
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

                            {/* ReactPlayer for everyone except P2P viewers and Spotify */}
                            {!isP2PViewer && !isSpotify && playerUrl && (
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
