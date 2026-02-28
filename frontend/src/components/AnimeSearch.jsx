import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Magnet, ArrowUp, ArrowDown, ChevronRight, Loader2, Film } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const formatSize = (str) => {
    if (!str) return '';
    return str;
};

const AnimeSearch = ({ onSelect, onClose }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [trustedOnly, setTrustedOnly] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSearch = async (e) => {
        e?.preventDefault();
        if (!query.trim()) return;
        setLoading(true);
        setError(null);
        setResults([]);
        try {
            const params = new URLSearchParams({
                q: query.trim(),
                filter: trustedOnly ? 2 : 0,
                category: '1_2', // English-translated anime
            });
            const res = await fetch(`${BACKEND_URL}/api/nyaa/search?${params}`);
            if (!res.ok) throw new Error('Search failed');
            const data = await res.json();
            setResults(data.results || []);
        } catch (err) {
            setError('Failed to search. Make sure the backend is running.');
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (result) => {
        onSelect(result);
        onClose();
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <motion.div
                initial={{ scale: 0.96, opacity: 0, y: 12 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.96, opacity: 0, y: 12 }}
                transition={{ type: 'spring', damping: 22 }}
                className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
                style={{ background: 'var(--panel-bg, #18181b)', border: '1px solid rgba(255,255,255,0.1)' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="flex items-center gap-2 text-purple-400">
                        <Film size={18} />
                        <span className="font-semibold text-sm text-white">Search Anime</span>
                    </div>
                    <span className="text-xs text-gray-500">via Nyaa.si · streams via WebTorrent P2P</span>
                    <button onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-white/10 text-gray-400 transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* Search bar */}
                <div className="px-5 pt-4 pb-3">
                    <form onSubmit={handleSearch} className="flex gap-2">
                        <div className="flex-1 flex items-center gap-2 bg-zinc-800/60 border border-white/10 rounded-xl px-3 py-2 focus-within:border-purple-500/50 transition-colors">
                            <Search size={15} className="text-gray-500 shrink-0" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder='e.g. "One Piece 1100 1080p" or "Demon Slayer S4"'
                                className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
                            />
                            {query && (
                                <button type="button" onClick={() => setQuery('')} className="text-gray-500 hover:text-gray-300">
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                        <button
                            type="submit"
                            disabled={!query.trim() || loading}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-colors"
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
                        </button>
                    </form>
                    {/* Filters */}
                    <div className="flex items-center gap-3 mt-2">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={trustedOnly}
                                onChange={e => setTrustedOnly(e.target.checked)}
                                className="accent-purple-500 rounded"
                            />
                            <span className="text-xs text-gray-400">Trusted uploaders only</span>
                        </label>
                        <span className="text-xs text-gray-600">· Category: English-translated anime</span>
                    </div>
                </div>

                {/* Results */}
                <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-2 min-h-0">
                    {error && (
                        <div className="py-8 text-center text-red-400 text-sm">{error}</div>
                    )}
                    {!loading && !error && results.length === 0 && query && (
                        <div className="py-8 text-center text-gray-500 text-sm">No results found. Try a different search term.</div>
                    )}
                    {!loading && !error && results.length === 0 && !query && (
                        <div className="py-8 text-center text-gray-600 text-sm">Type an anime name and press Search to find torrents</div>
                    )}

                    <AnimatePresence>
                        {results.map((r, i) => (
                            <motion.button
                                key={i}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.03 }}
                                onClick={() => handleSelect(r)}
                                className="w-full text-left flex items-start gap-3 p-3 rounded-xl border border-transparent hover:border-purple-500/30 hover:bg-purple-500/5 transition-all group"
                            >
                                <Magnet size={15} className="text-purple-400 mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-gray-200 group-hover:text-white transition-colors truncate font-medium" title={r.name}>
                                        {r.trusted && (
                                            <span className="inline-block mr-1.5 px-1.5 py-0.5 text-[10px] bg-green-500/20 text-green-400 border border-green-500/30 rounded-full align-middle">✓ Trusted</span>
                                        )}
                                        {r.name}
                                    </p>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-xs text-gray-500">{formatSize(r.size)}</span>
                                        <span className="flex items-center gap-0.5 text-xs text-green-400"><ArrowUp size={10} />{r.seeders}</span>
                                        <span className="flex items-center gap-0.5 text-xs text-red-400"><ArrowDown size={10} />{r.leechers}</span>
                                        <span className="text-xs text-gray-600">{r.date}</span>
                                    </div>
                                </div>
                                <ChevronRight size={14} className="text-gray-600 group-hover:text-purple-400 transition-colors mt-0.5 shrink-0" />
                            </motion.button>
                        ))}
                    </AnimatePresence>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default AnimeSearch;
