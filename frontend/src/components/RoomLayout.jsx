import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Play, Settings, Share2, Menu, X } from 'lucide-react';
import ChatUI from './ChatUI';
import UserQueueSidebar from './UserQueueSidebar';
import VideoPlayer from './VideoPlayer';
import { useRoom } from '../context/RoomContext';

const RoomLayout = () => {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const { currentUser, leaveRoom } = useRoom();
    const [showSidebar, setShowSidebar] = useState(false);

    React.useEffect(() => {
        if (!currentUser) {
            navigate('/', { replace: true });
            return;
        }

        // We handle the join room action from LandingPage before navigation usually.
        // If we want direct link joins later, we'd handle it here prompting for a nickname.
        return () => {
            leaveRoom();
        };
    }, [currentUser, leaveRoom, navigate]);

    // Don't render until we verify user or redirect
    if (!currentUser) return null;

    return (
        <div className="h-screen w-full flex flex-col bg-background text-white overflow-hidden relative">
            {/* Background gradients */}
            <div className="absolute top-0 left-[20%] w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[10%] w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

            {/* Navbar */}
            <header className="h-16 border-b border-white/10 bg-zinc-900/50 backdrop-blur-md flex items-center justify-between px-6 z-20 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-600/20">
                            <Play fill="white" size={16} className="ml-0.5" />
                        </div>
                        <span className="font-bold text-xl tracking-tight hidden sm:block">WatchSync</span>
                    </div>
                    <div className="h-6 w-px bg-white/10 mx-2 hidden sm:block" />
                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1 shadow-inner">
                        <span className="text-gray-400 text-sm">Room:</span>
                        <span className="font-mono font-medium text-purple-300">{roomId}</span>
                        <button className="text-gray-400 hover:text-white transition-colors ml-2">
                            <Share2 size={14} />
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors hidden sm:block">
                        <Settings size={20} />
                    </button>
                    <button
                        onClick={() => {
                            leaveRoom();
                            navigate('/');
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-lg transition-all font-medium text-sm"
                    >
                        <LogOut size={16} />
                        <span className="hidden sm:inline">Leave Room</span>
                    </button>
                    {/* Mobile menu toggle */}
                    <button
                        className="p-2 sm:hidden text-gray-300 hover:text-white"
                        onClick={() => setShowSidebar(!showSidebar)}
                    >
                        {showSidebar ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 flex overflow-hidden p-2 sm:p-4 gap-4 z-10 relative">

                {/* Left: Video Player Area */}
                <section className="flex-1 flex flex-col min-w-0 bg-zinc-900/30 backdrop-blur-sm border border-white/10 rounded-3xl overflow-hidden relative shadow-2xl p-2 sm:p-4">
                    <VideoPlayer />
                </section>

                {/* Right: Sidebar / Chat (Desktop) */}
                <section className="hidden lg:flex w-80 xl:w-96 flex-col gap-4 shrink-0">
                    <div className="h-1/2 min-h-0 flex flex-col">
                        <UserQueueSidebar />
                    </div>
                    <div className="h-1/2 min-h-0 flex flex-col">
                        <ChatUI />
                    </div>
                </section>

                {/* Mobile Sidebar Overlay */}
                <AnimatePresence>
                    {showSidebar && (
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="lg:hidden absolute inset-y-0 right-0 w-80 bg-zinc-900/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-50 flex flex-col p-4 gap-4"
                        >
                            <div className="flex justify-between items-center mb-2">
                                <h2 className="font-semibold">Room Controls</h2>
                                <button onClick={() => setShowSidebar(false)} className="text-gray-400"><X size={20} /></button>
                            </div>
                            <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-4">
                                <div className="h-1/2 min-h-0 flex flex-col"><UserQueueSidebar /></div>
                                <div className="h-1/2 min-h-0 flex flex-col"><ChatUI /></div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

            </main>
        </div>
    );
};

export default RoomLayout;
