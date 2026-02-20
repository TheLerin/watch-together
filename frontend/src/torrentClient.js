// Import WebTorrent properly for a Vite/Webpack browser environment
import WebTorrent from 'webtorrent/dist/webtorrent.min.js';

// We want a SINGLE instance of the WebTorrent client for the entire application lifecycle.
// If we created a new client inside a component, hot-reloading or re-mounting would
// spawn duplicate P2P nodes and crash the browser network stack or memory.
let client = null;

export const getTorrentClient = () => {
    if (!client) {
        client = new WebTorrent();

        // Handle global errors
        client.on('error', (err) => {
            console.error('WebTorrent Global Error:', err);
        });
    }
    return client;
};

export const destroyTorrentClient = () => {
    if (client) {
        client.destroy((err) => {
            if (err) console.error('Error destroying torrent client:', err);
            client = null;
        });
    }
};
