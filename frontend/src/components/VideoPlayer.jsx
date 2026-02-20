import React, { useRef, useEffect, useState } from 'react';
import ReactPlayer from 'react-player';
import { useRoom } from '../context/RoomContext';
import { Play, Link as LinkIcon, Lock } from 'lucide-react';

const VideoPlayer = () => {
    const { videoState, currentUser, loadVideo, playVideo, pauseVideo, seekVideo } = useRoom();
    const playerRef = useRef(null);
    const [inputUrl, setInputUrl] = useState('');
    const [isPlayerReady, setIsPlayerReady] = useState(false);

    const isPrivileged = currentUser?.role === 'Host' || currentUser?.role === 'Moderator';

    // Sync external state changes into the local player
    useEffect(() => {
        if (!isPlayerReady || !playerRef.current || !videoState.url) return;

        const internalTime = playerRef.current.getCurrentTime() || 0;
        const stateTime = videoState.playedSeconds || 0;

        // If the server's time is significantly different from the local player time (> 2s),
        // we force a seek. This prevents jittery loops from slight natural desynchronizations.
        if (Math.abs(internalTime - stateTime) > 2) {
            playerRef.current.seekTo(stateTime, 'seconds');
        }
    }, [videoState.playedSeconds, videoState.updatedAt, isPlayerReady, videoState.url]);

    const handleLoad = (e) => {
        e.preventDefault();
        if (isPrivileged) {
            loadVideo(inputUrl);
            setInputUrl('');
        }
    };

    const handlePlay = () => {
        if (!isPrivileged) return;
        if (!videoState.isPlaying) playVideo();
    };

    const handlePause = () => {
        if (!isPrivileged) return;
        if (videoState.isPlaying) pauseVideo();
    };

    const handleSeek = (seconds) => {
        if (!isPrivileged) return;
        seekVideo(seconds);
    };

    return (
        <div className="flex flex-col h-full w-full gap-4 relative">
            {/* Control Bar for Hosts/Moderators */}
            {isPrivileged && (
                <form onSubmit={handleLoad} className="flex gap-2">
                    <div className="relative flex-1">
                        <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                        <input
                            type="text"
                            value={inputUrl}
                            onChange={e => setInputUrl(e.target.value)}
                            placeholder="Enter YouTube, Vimeo, or direct video URL..."
                            className="w-full bg-zinc-900/50 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-all"
                        />
                    </div>
                    <button type="submit" className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-medium transition-colors">
                        Load
                    </button>
                </form>
            )}

            {/* Video Player Container */}
            <div className="flex-1 bg-black rounded-2xl overflow-hidden border border-white/10 relative group">
                {!videoState.url ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10">
                        <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6 ring-4 ring-white/5 animate-pulse">
                            <Play size={32} className="text-gray-400 ml-2" />
                        </div>
                        <h2 className="text-xl font-semibold mb-2 text-gray-200">No Video Playing</h2>
                        <p className="text-gray-400 max-w-sm text-sm">
                            {isPrivileged ? "Enter a video link above to start watching together." : "Waiting for the Host to start a video."}
                        </p>
                    </div>
                ) : (
                    <>
                        {/* The actual React Player */}
                        <ReactPlayer
                            ref={playerRef}
                            url={videoState.url}
                            playing={videoState.isPlaying}
                            controls={isPrivileged} // Only show native controls for privileged users
                            width="100%"
                            height="100%"
                            onReady={() => setIsPlayerReady(true)}
                            onPlay={handlePlay}
                            onPause={handlePause}
                            onSeek={handleSeek}
                            // To prevent loopback spam, we rely on the internal progress event 
                            // sparingly, but primarily just broadcast state changes.
                            config={{
                                youtube: {
                                    playerVars: {
                                        disablekb: isPrivileged ? 0 : 1,
                                        modestbranding: 1
                                    }
                                }
                            }}
                        />

                        {/* Overlay for Viewers to block clicking on native iframe play/pause buttons */}
                        {!isPrivileged && (
                            <div className="absolute inset-0 z-20" />
                        )}

                        {/* Lock Icon indicator for Viewers */}
                        {!isPrivileged && (
                            <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-30 pointer-events-none">
                                <Lock size={12} className="text-gray-400" />
                                <span className="text-xs text-gray-300 font-medium tracking-wide">Viewer constraints active</span>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default VideoPlayer;
