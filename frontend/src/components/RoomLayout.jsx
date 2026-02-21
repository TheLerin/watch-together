import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LogOut, Play, Settings, Copy, Users, ChevronDown, ChevronUp,
    MessageSquare, X, Moon, Sun, Monitor, Palette, Menu, GripHorizontal
} from 'lucide-react';
import ChatUI from './ChatUI';
import UserQueueSidebar from './UserQueueSidebar';
import VideoPlayer from './VideoPlayer';
import { useRoom } from '../context/RoomContext';
import { useTheme } from '../context/ThemeContext';
import toast from 'react-hot-toast';

// ─── Hooks ───────────────────────────────────────────────────────────────────
function useViewport() {
    const get = () => ({
        isDesktop: window.innerWidth >= 1024,
        isPortrait: window.innerHeight > window.innerWidth,
    });
    const [vp, setVp] = useState(get);
    useEffect(() => {
        const update = () => setVp(get());
        window.addEventListener('resize', update);
        window.addEventListener('orientationchange', update);
        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('orientationchange', update);
        };
    }, []);
    return vp;
}

function useDragResize(defaultPct = 55) {
    const [heightPct, setHeightPct] = useState(defaultPct);
    const dragStartY = useRef(null);
    const dragStartPct = useRef(null);
    const onDragStart = useCallback((e) => {
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        dragStartY.current = clientY;
        dragStartPct.current = heightPct;
        const onMove = (ev) => {
            const y = ev.touches ? ev.touches[0].clientY : ev.clientY;
            const delta = dragStartY.current - y;
            const vhDelta = (delta / window.innerHeight) * 100;
            setHeightPct(() => Math.min(85, Math.max(28, (dragStartPct.current ?? 55) + vhDelta)));
        };
        const onEnd = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
        };
        document.addEventListener('mousemove', onMove, { passive: true });
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchmove', onMove, { passive: true });
        document.addEventListener('touchend', onEnd);
    }, [heightPct]);
    return { heightPct, onDragStart };
}

// ─── RoomLayout ───────────────────────────────────────────────────────────────
const RoomLayout = () => {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const { currentUser, leaveRoom, users, isRestoringSession } = useRoom();
    const { theme, setTheme } = useTheme();

    const [showUsersPanel, setShowUsersPanel] = useState(false);
    const [showSettingsMenu, setShowSettingsMenu] = useState(false);
    const [showMobileChat, setShowMobileChat] = useState(false);
    const settingsRef = useRef(null);

    const { isDesktop, isPortrait } = useViewport();
    const { heightPct, onDragStart } = useDragResize(55);

    useEffect(() => {
        if (!currentUser && !isRestoringSession) navigate('/', { replace: true });
    }, [currentUser, isRestoringSession, navigate]);

    useEffect(() => {
        const close = (e) => {
            if (settingsRef.current && !settingsRef.current.contains(e.target)) setShowSettingsMenu(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    if (isRestoringSession) {
        return <div className="h-screen w-full flex items-center justify-center bg-zinc-950"><div className="w-12 h-12 rounded-full border-4 border-purple-500 border-t-transparent animate-spin" /></div>;
    }
    if (!currentUser) return null;

    const videoHeightPct = showMobileChat ? 100 - heightPct : 100;

    return (
        <div className="h-screen w-full flex flex-col bg-zinc-950 text-white overflow-hidden">
            {/* Decorative blobs */}
            {isDesktop && (
                <>
                    <div className="pointer-events-none fixed top-0 left-1/4 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[120px] -z-0" />
                    <div className="pointer-events-none fixed bottom-0 right-1/4 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] -z-0" />
                </>
            )}

            {/* ─── HEADER (always shown) ─────────────────────────── */}
            <header className="flex-none h-14 bg-zinc-900/95 border-b border-zinc-800 flex items-center justify-between px-3 sm:px-5 z-40 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate('/')} className="flex items-center gap-2">
                        <img src="/logo.png" alt="WatchSync" className="w-8 h-8 rounded-lg object-cover shadow-lg shadow-purple-600/30" />
                        <span className="font-bold text-lg text-white hidden sm:block">WatchSync</span>
                    </button>
                    <div className="hidden sm:block w-px h-5 bg-zinc-700" />
                    <button
                        onClick={() => { navigator.clipboard.writeText(roomId); toast.success('Room ID copied!', { icon: '📋' }); }}
                        className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded-full px-2.5 py-1 hover:bg-zinc-700 transition-colors"
                    >
                        <span className="text-zinc-400 text-xs hidden sm:inline">Room:</span>
                        <span className="font-mono font-semibold text-purple-300 text-xs">{roomId}</span>
                        <Copy size={11} className="text-zinc-500" />
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative" ref={settingsRef}>
                        <button onClick={() => setShowSettingsMenu(s => !s)} className={`p-2 rounded-lg transition-colors ${showSettingsMenu ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}>
                            <Settings size={20} />
                        </button>
                        <AnimatePresence>
                            {showSettingsMenu && (
                                <motion.div initial={{ opacity: 0, scale: 0.95, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -6 }} transition={{ duration: 0.15 }}
                                    className="absolute top-full right-0 mt-2 w-52 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl z-50 p-2 flex flex-col gap-0.5">
                                    <div className="px-3 py-2 mb-1 border-b border-zinc-800">
                                        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Theme</h3>
                                    </div>
                                    {[
                                        { id: 'dark', icon: <Moon size={15} />, label: 'Default Dark' },
                                        { id: 'light', icon: <Sun size={15} />, label: 'Light' },
                                        { id: 'amoled', icon: <Monitor size={15} />, label: 'AMOLED Black' },
                                        { id: 'adaptive', icon: <Palette size={15} />, label: 'Adaptive Color' },
                                    ].map(t => (
                                        <button key={t.id} onClick={() => { setTheme(t.id); setShowSettingsMenu(false); }}
                                            className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-left transition-colors ${theme === t.id ? 'bg-purple-500/20 text-purple-300' : 'text-zinc-300 hover:bg-zinc-800'}`}>
                                            {t.icon} {t.label}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                    <button onClick={() => { leaveRoom(); navigate('/'); }}
                        className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-all text-sm font-medium">
                        <LogOut size={15} />
                        <span className="hidden sm:inline">Leave</span>
                    </button>
                </div>
            </header>

            {/* ─── CONTENT (exactly ONE VideoPlayer rendered at a time) ─── */}

            {/* DESKTOP */}
            {isDesktop && (
                <div className="flex-1 min-h-0 flex">
                    {/* Video */}
                    <div className="flex-1 min-h-0 min-w-0 flex flex-col p-3">
                        <div className="flex-1 min-h-0 rounded-2xl overflow-hidden border border-zinc-800 bg-black">
                            <VideoPlayer />
                        </div>
                    </div>
                    {/* Right panel */}
                    <div className="w-80 xl:w-96 flex flex-col gap-0 shrink-0 p-3 pl-0">
                        <div className="mb-2 rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900/60">
                            <button onClick={() => setShowUsersPanel(v => !v)}
                                className="flex items-center justify-between w-full px-4 py-3 hover:bg-white/5 transition-colors">
                                <span className="flex items-center gap-2 text-sm font-semibold text-white">
                                    <Users size={15} className="text-purple-400" /> Users & Queue
                                    <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded-full">{users.length}</span>
                                </span>
                                {showUsersPanel ? <ChevronUp size={15} className="text-zinc-400" /> : <ChevronDown size={15} className="text-zinc-400" />}
                            </button>
                            <AnimatePresence initial={false}>
                                {showUsersPanel && (
                                    <motion.div key="du" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}
                                        className="overflow-hidden border-t border-zinc-800">
                                        <div className="max-h-72 overflow-y-auto"><UserQueueSidebar compact /></div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        <div className="flex-1 min-h-0"><ChatUI /></div>
                    </div>
                </div>
            )}

            {/* MOBILE PORTRAIT */}
            {!isDesktop && isPortrait && (
                <div className="flex-1 min-h-0 relative flex flex-col bg-black overflow-hidden">
                    {/* Video — shrinks when chat open */}
                    <div className="relative bg-black flex-shrink-0 transition-[height] duration-300 ease-out" style={{ height: `${videoHeightPct}%` }}>
                        <VideoPlayer />
                        {/* Right icon rail */}
                        <div className="absolute right-3 bottom-10 flex flex-col items-center gap-5 z-20">
                            <button onClick={() => setShowUsersPanel(true)} className="flex flex-col items-center gap-1">
                                <div className="w-11 h-11 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/20 shadow-lg">
                                    <Menu size={22} className="text-white" />
                                </div>
                                <span className="text-white text-[10px] font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">Members</span>
                            </button>
                            <button onClick={() => setShowMobileChat(v => !v)} className="flex flex-col items-center gap-1">
                                <div className={`w-11 h-11 rounded-full backdrop-blur-sm flex items-center justify-center border shadow-lg transition-colors ${showMobileChat ? 'bg-purple-600 border-purple-400' : 'bg-black/60 border-white/20'}`}>
                                    <MessageSquare size={22} className="text-white" />
                                </div>
                                <span className="text-white text-[10px] font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">Chat</span>
                            </button>
                        </div>
                    </div>

                    {/* Resizable chat sheet */}
                    <AnimatePresence>
                        {showMobileChat && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="flex flex-col bg-zinc-950 border-t border-zinc-700"
                                style={{ height: `${heightPct}%` }}>
                                <div className="flex items-center justify-between px-4 py-2.5 cursor-row-resize select-none shrink-0 bg-zinc-900 border-b border-zinc-800"
                                    onMouseDown={onDragStart} onTouchStart={onDragStart}>
                                    <div className="flex items-center gap-2">
                                        <GripHorizontal size={16} className="text-zinc-500" />
                                        <span className="text-sm font-bold text-white">Live Chat</span>
                                    </div>
                                    <button onClick={() => setShowMobileChat(false)} className="p-1.5 text-zinc-400 hover:text-white transition-colors">
                                        <X size={18} />
                                    </button>
                                </div>
                                <div className="flex-1 min-h-0"><ChatUI hideHeader /></div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Members bottom sheet */}
                    <AnimatePresence>
                        {showUsersPanel && (
                            <>
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    className="absolute inset-0 bg-black/60 z-30" onClick={() => setShowUsersPanel(false)} />
                                <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                                    transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                                    className="absolute inset-x-0 bottom-0 z-40 rounded-t-3xl bg-zinc-900 border-t border-zinc-700 flex flex-col"
                                    style={{ maxHeight: '70vh' }}>
                                    <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
                                        <h2 className="font-bold text-white flex items-center gap-2">
                                            <Users size={16} className="text-purple-400" /> Members & Queue
                                            <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded-full">{users.length}</span>
                                        </h2>
                                        <button onClick={() => setShowUsersPanel(false)} className="p-1.5 text-zinc-400 hover:text-white"><X size={20} /></button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto"><UserQueueSidebar compact /></div>
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* MOBILE LANDSCAPE */}
            {!isDesktop && !isPortrait && (
                <div className="flex-1 min-h-0 flex flex-col">
                    <div className="w-full bg-black shrink-0" style={{ height: '55vw', maxHeight: '58vh' }}>
                        <VideoPlayer />
                    </div>
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border-b border-zinc-800 shrink-0">
                            <button onClick={() => setShowUsersPanel(v => !v)} className="flex items-center gap-2 text-xs text-zinc-300 hover:text-white transition-colors">
                                <Users size={13} className="text-purple-400" />
                                <span className="font-semibold">{users.length} Members</span>
                                {showUsersPanel ? <ChevronUp size={12} className="text-zinc-400" /> : <ChevronDown size={12} className="text-zinc-400" />}
                            </button>
                        </div>
                        <AnimatePresence initial={false}>
                            {showUsersPanel && (
                                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden shrink-0 border-b border-zinc-800">
                                    <div className="max-h-28 overflow-y-auto"><UserQueueSidebar compact /></div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <div className="flex-1 min-h-0"><ChatUI /></div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RoomLayout;
