import React from 'react';
import { Users, Crown, Shield, Video, Plus, MoreVertical, UserPlus, UserMinus, UserX, ArrowRight } from 'lucide-react';
import { useRoom } from '../context/RoomContext';
import { AnimatePresence } from 'framer-motion';

const UserQueueSidebar = () => {
    const { users, currentUser, promoteUser, demoteUser, transferHost, kickUser } = useRoom();
    const [openMenuId, setOpenMenuId] = React.useState(null);

    // Close menu when clicking outside (simple implementation for now)
    React.useEffect(() => {
        const handleClickOutside = () => setOpenMenuId(null);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const queue = [
        { id: 1, title: 'Epic React Tutorial', duration: '12:04' },
        { id: 2, title: 'Funny Cats Compilation', duration: '8:30' },
    ];

    return (
        <div className="flex flex-col h-full gap-4">
            {/* Users Section */}
            <div className="flex-1 bg-zinc-900/30 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-200 flex items-center gap-2">
                        <Users size={16} /> Users
                    </h3>
                    <span className="text-xs text-gray-400 font-medium">{users.length} Online</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1 relative">
                    {users.map(user => (
                        <div key={user.id} className="relative group">
                            <div className="flex items-center justify-between p-2 hover:bg-white/5 rounded-lg transition-colors cursor-default">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-gray-300">
                                        {user.nickname} {currentUser?.id === user.id && "(You)"}
                                    </span>
                                    {user.role === 'Host' && <Crown size={14} className="text-purple-400" />}
                                    {user.role === 'Moderator' && <Shield size={14} className="text-blue-400" />}
                                </div>

                                {/* Only show actions if current user is Host/Mod and target is not themselves */}
                                {currentUser && currentUser.id !== user.id && (currentUser.role === 'Host' || (currentUser.role === 'Moderator' && user.role === 'Viewer')) && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenMenuId(openMenuId === user.id ? null : user.id);
                                        }}
                                        className="p-1 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-white/10 text-gray-400 transition-all"
                                    >
                                        <MoreVertical size={14} />
                                    </button>
                                )}
                            </div>

                            {/* Dropdown Menu */}
                            <AnimatePresence>
                                {openMenuId === user.id && (
                                    <div
                                        className="absolute right-8 top-8 w-48 bg-zinc-800 border border-white/10 rounded-xl shadow-xl overflow-hidden z-50 py-1"
                                    >
                                        {currentUser.role === 'Host' && user.role === 'Viewer' && (
                                            <button
                                                onClick={() => { promoteUser(user.id); setOpenMenuId(null); }}
                                                className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/5 flex items-center gap-2"
                                            >
                                                <UserPlus size={14} className="text-blue-400" /> Promote to Mod
                                            </button>
                                        )}
                                        {currentUser.role === 'Host' && user.role === 'Moderator' && (
                                            <button
                                                onClick={() => { demoteUser(user.id); setOpenMenuId(null); }}
                                                className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/5 flex items-center gap-2"
                                            >
                                                <UserMinus size={14} className="text-gray-400" /> Demote to Viewer
                                            </button>
                                        )}
                                        {currentUser.role === 'Host' && (
                                            <button
                                                onClick={() => { transferHost(user.id); setOpenMenuId(null); }}
                                                className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/5 flex items-center gap-2"
                                            >
                                                <ArrowRight size={14} className="text-purple-400" /> Transfer Host
                                            </button>
                                        )}
                                        {(currentUser.role === 'Host' || (currentUser.role === 'Moderator' && user.role === 'Viewer')) && (
                                            <button
                                                onClick={() => { kickUser(user.id); setOpenMenuId(null); }}
                                                className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 border-t border-white/5 mt-1 pt-2"
                                            >
                                                <UserX size={14} /> Kick User
                                            </button>
                                        )}
                                    </div>
                                )}
                            </AnimatePresence>
                        </div>
                    ))}
                </div>
            </div>

            {/* Video Queue Section */}
            <div className="flex-1 bg-zinc-900/30 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-200 flex items-center gap-2">
                        <Video size={16} /> Up Next
                    </h3>
                    <button className="text-gray-400 hover:text-white transition-colors bg-white/5 p-1 rounded-md">
                        <Plus size={16} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {queue.map((video, idx) => (
                        <div key={video.id} className="p-3 bg-black/40 border border-white/5 rounded-xl hover:border-white/20 transition-colors cursor-pointer group">
                            <div className="text-xs text-purple-400 font-medium mb-1">#{idx + 1}</div>
                            <div className="text-sm text-gray-200 font-medium truncate">{video.title}</div>
                            <div className="text-xs text-gray-500 mt-1">{video.duration}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default UserQueueSidebar;
