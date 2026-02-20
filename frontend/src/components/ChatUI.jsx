import React from 'react';
import { Send } from 'lucide-react';
import { useRoom } from '../context/RoomContext';

const ChatUI = () => {
    const { messages, sendMessage } = useRoom();
    const [inputValue, setInputValue] = React.useState('');

    const handleSend = (e) => {
        e.preventDefault();
        sendMessage(inputValue);
        setInputValue('');
    };

    const getRoleColor = (role) => {
        switch (role) {
            case 'Host': return 'text-purple-400';
            case 'Moderator': return 'text-blue-400';
            default: return 'text-gray-400';
        }
    };

    return (
        <div className="flex flex-col h-full bg-zinc-900/30 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-white/10 bg-white/5">
                <h3 className="font-semibold text-gray-200">Live Chat</h3>
            </div>

            {/* Messages */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {messages.map(msg => (
                    <div key={msg.id} className="text-sm">
                        <div className="flex items-end gap-2 mb-1">
                            <span className={`font-medium ${getRoleColor(msg.role)}`}>{msg.user}</span>
                            <span className="text-[10px] text-gray-500">{msg.time}</span>
                        </div>
                        <div className="bg-white/5 inline-block px-3 py-2 rounded-lg rounded-tl-none border border-white/5 text-gray-300">
                            {msg.text}
                        </div>
                    </div>
                ))}
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white/5 border-t border-white/10">
                <form onSubmit={handleSend} className="relative flex items-center">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Type a message..."
                        className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all"
                    />
                    <button type="submit" className="absolute right-2 p-2 text-gray-400 hover:text-white transition-colors">
                        <Send size={18} />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ChatUI;
