import React from 'react';
import { Users, Crown, Shield, Video, Plus } from 'lucide-react';
import { useRoom } from '../context/RoomContext';

const UserQueueSidebar = () => {
    const { users } = useRoom();

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
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {users.map(user => (
                        <div key={user.id} className="flex items-center justify-between p-2 hover:bg-white/5 rounded-lg transition-colors group cursor-default">
                            <span className="text-sm font-medium text-gray-300">{user.nickname}</span>
                            {user.role === 'Host' && <Crown size={14} className="text-purple-400" />}
                            {user.role === 'Moderator' && <Shield size={14} className="text-blue-400" />}
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
