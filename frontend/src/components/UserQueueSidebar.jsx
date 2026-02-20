import React from 'react';
import { Users, Crown, Shield, Video, MoreVertical, UserPlus, UserMinus, UserX, ArrowRight, Trash2, PlayCircle, SkipForward } from 'lucide-react';
import { useRoom } from '../context/RoomContext';
import { AnimatePresence, motion } from 'framer-motion';

const UserQueueSidebar = () => {
    const { users, currentUser, promoteUser, demoteUser, transferHost, kickUser, queue, removeFromQueue, playNext } = useRoom();
    const [openMenuId, setOpenMenuId] = React.useState(null);

    const isPrivileged = currentUser?.role === 'Host' || currentUser?.role === 'Moderator';

    React.useEffect(() => {
        const handleClickOutside = () => setOpenMenuId(null);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    return (
        <div className="flex flex-col h-full gap-4">
            {/* ── Users Section ──────────────────────────────────── */}
            <div className="flex-1 bg-zinc-900/30 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden flex flex-col min-h-0">
                <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between flex-shrink-0">
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
                                        {user.nickname} {currentUser?.id === user.id && '(You)'}
                                    </span>
                                    {user.role === 'Host' && <Crown size={14} className="text-purple-400" />}
                                    {user.role === 'Moderator' && <Shield size={14} className="text-blue-400" />}
                                </div>

                                {currentUser && currentUser.id !== user.id &&
                                    (currentUser.role === 'Host' || (currentUser.role === 'Moderator' && user.role === 'Viewer')) && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === user.id ? null : user.id); }}
                                            className="p-1 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-white/10 text-gray-400 transition-all"
                                        >
                                            <MoreVertical size={14} />
                                        </button>
                                    )}
                            </div>

                            <AnimatePresence>
                                {openMenuId === user.id && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -4 }}
                                        className="absolute right-8 top-8 w-48 bg-zinc-800 border border-white/10 rounded-xl shadow-xl overflow-hidden z-50 py-1"
                                    >
                                        {currentUser.role === 'Host' && user.role === 'Viewer' && (
                                            <button onClick={() => { promoteUser(user.id); setOpenMenuId(null); }}
                                                className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/5 flex items-center gap-2">
                                                <UserPlus size={14} className="text-blue-400" /> Promote to Mod
                                            </button>
                                        )}
                                        {currentUser.role === 'Host' && user.role === 'Moderator' && (
                                            <button onClick={() => { demoteUser(user.id); setOpenMenuId(null); }}
                                                className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/5 flex items-center gap-2">
                                                <UserMinus size={14} className="text-gray-400" /> Demote to Viewer
                                            </button>
                                        )}
                                        {currentUser.role === 'Host' && (
                                            <button onClick={() => { transferHost(user.id); setOpenMenuId(null); }}
                                                className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/5 flex items-center gap-2">
                                                <ArrowRight size={14} className="text-purple-400" /> Transfer Host
                                            </button>
                                        )}
                                        <button onClick={() => { kickUser(user.id); setOpenMenuId(null); }}
                                            className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 border-t border-white/5 mt-1 pt-2">
                                            <UserX size={14} /> Kick User
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Up Next Queue ────────────────────────────────────── */}
            <div className="flex-1 bg-zinc-900/30 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden flex flex-col min-h-0">
                <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between flex-shrink-0">
                    <h3 className="font-semibold text-gray-200 flex items-center gap-2">
                        <Video size={16} /> Up Next
                        {queue.length > 0 && (
                            <span className="ml-1 text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded-full">
                                {queue.length}
                            </span>
                        )}
                    </h3>
                    {isPrivileged && queue.length > 0 && (
                        <button
                            onClick={playNext}
                            className="flex items-center gap-1.5 text-xs text-purple-300 hover:text-purple-200 transition-colors"
                            title="Play next in queue"
                        >
                            <SkipForward size={14} /> Play Next
                        </button>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    <AnimatePresence>
                        {queue.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center p-6 text-center h-full">
                                <p className="text-sm text-gray-500">
                                    {isPrivileged ? 'Add URLs to the queue with the Queue button.' : 'Queue is empty.'}
                                </p>
                            </div>
                        ) : (
                            queue.map((item, idx) => (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 8 }}
                                    className="flex items-center gap-2 p-2 hover:bg-white/5 rounded-lg group/item"
                                >
                                    <span className="text-xs text-gray-500 w-4 flex-shrink-0">{idx + 1}</span>
                                    <PlayCircle size={14} className="text-gray-500 flex-shrink-0" />
                                    <span className="text-sm text-gray-300 flex-1 truncate" title={item.label}>
                                        {item.label}
                                    </span>
                                    {isPrivileged && (
                                        <button
                                            onClick={() => removeFromQueue(item.id)}
                                            className="opacity-0 group-hover/item:opacity-100 text-gray-500 hover:text-red-400 transition-all"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    )}
                                </motion.div>
                            ))
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};

export default UserQueueSidebar;
