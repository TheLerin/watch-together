import React, { useState } from 'react';
import { Play, Users, Sparkles, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRoom } from '../context/RoomContext';
import { motion } from 'framer-motion';

const LandingPage = () => {
    const navigate = useNavigate();
    const { joinRoom, currentUser, roomId } = useRoom();
    const [nickname, setNickname] = useState('');
    const [joinCode, setJoinCode] = useState('');

    React.useEffect(() => {
        if (currentUser && roomId) {
            navigate(`/room/${roomId}`);
        }
    }, [currentUser, roomId, navigate]);

    const handleCreateRoom = () => {
        if (!nickname.trim()) {
            alert('Please enter a nickname first!');
            return;
        }
        const randomId = Math.random().toString(36).substring(2, 9);
        joinRoom(randomId, nickname);
    };

    const handleJoinRoom = () => {
        if (!nickname.trim() || !joinCode.trim()) {
            alert('Please enter both a nickname and a room code!');
            return;
        }
        joinRoom(joinCode, nickname);
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center relative bg-background">
            {/* Animated Background Elements */}
            <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-600/20 rounded-full blur-[100px] animate-pulse" />
            <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-blue-500/20 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />

            {/* Navbar */}
            <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/20 backdrop-blur-md">
                <div className="flex items-center gap-2.5">
                    <img src="/logo.png" alt="WatchSync Logo" className="w-9 h-9 rounded-xl object-cover shadow-lg shadow-purple-600/30" />
                    <span className="font-bold text-xl tracking-tight text-white">WatchSync</span>
                </div>
                <span className="text-xs text-gray-500 border border-white/10 bg-white/5 px-3 py-1 rounded-full">Beta</span>
            </nav>

            <main className="z-10 w-full max-w-5xl px-6 flex flex-col lg:flex-row items-center gap-12 mt-16">
                {/* Left Side: Copy & Branding */}
                <motion.div
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="flex-1 text-center lg:text-left"
                >
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm text-sm font-medium mb-6 text-gray-300">
                        <Sparkles size={16} className="text-purple-400" />
                        <span>Premium Viewing Experience</span>
                    </div>
                    <h1 className="text-5xl lg:text-7xl font-bold tracking-tight mb-6">
                        Watch <span className="text-gradient">Together.</span> <br /> In Sync.
                    </h1>
                    <p className="text-lg text-gray-400 mb-8 max-w-lg mx-auto lg:mx-0">
                        Create a room, invite your friends, and enjoy synchronized playback of your favorite videos. Zero friction, pure luxury.
                    </p>

                    <div className="flex flex-col gap-4 max-w-sm mx-auto lg:mx-0 mb-8">
                        <div className="relative flex items-center">
                            <User size={18} className="absolute left-4 text-gray-500" />
                            <input
                                type="text"
                                placeholder="Enter your nickname..."
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                                className="w-full bg-black/50 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all font-medium"
                            />
                        </div>
                        <div className="relative flex items-center">
                            <span className="absolute left-4 text-gray-500 font-mono">#</span>
                            <input
                                type="text"
                                placeholder="Room code (optional)"
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value)}
                                className="w-full bg-black/50 border border-white/10 rounded-xl py-4 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all font-medium uppercase"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                        <button
                            onClick={handleCreateRoom}
                            disabled={!nickname.trim()}
                            className="group relative px-8 py-4 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed border border-white/20 rounded-xl font-medium transition-all duration-300 overflow-hidden flex items-center justify-center gap-2"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-purple-600/50 to-blue-500/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                            <Play size={20} className="relative z-10 text-white" />
                            <span className="relative z-10">Create a Room</span>
                        </button>
                        <button
                            onClick={handleJoinRoom}
                            disabled={!nickname.trim() || !joinCode.trim()}
                            className="px-8 py-4 bg-transparent hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2 text-gray-300 hover:text-white"
                        >
                            {/* LinkIcon uses removed */}
                            <span>Join with Code</span>
                        </button>
                    </div>
                </motion.div>

                {/* Right Side: Visual Representation */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                    className="flex-1 w-full max-w-md animate-float"
                >
                    <div className="glass-card p-6 aspect-video flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <div className="flex gap-2">
                                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                                <div className="w-3 h-3 rounded-full bg-green-500/80" />
                            </div>
                            <div className="flex -space-x-2">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="w-8 h-8 rounded-full border border-gray-800 bg-gray-700 flex items-center justify-center text-xs shadow-lg">
                                        <Users size={12} className="text-gray-300" />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex-1 my-4 bg-black/40 rounded-lg border border-white/5 flex items-center justify-center mt-6">
                            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/20 text-white">
                                <Play fill="currentColor" size={24} className="ml-1" />
                            </div>
                        </div>

                        <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 w-1/3 rounded-full" />
                        </div>
                    </div>
                </motion.div>
            </main>
        </div>
    );
};

export default LandingPage;
