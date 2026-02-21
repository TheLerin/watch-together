# STACK.md — Technology Inventory

> Updated: 2026-02-21

## Backend

| Package | Version | Purpose |
|---------|---------|---------|
| Node.js | LTS | Server runtime |
| Express | ^5.2.1 | HTTP API + static serving |
| Socket.io | ^4.8.3 | WebSocket real-time events |
| bittorrent-tracker | ^11.2.2 | Local WebTorrent tracker for P2P |
| cors | ^2.8.6 | CORS middleware |

## Frontend

| Package | Version | Purpose |
|---------|---------|---------|
| React | ^18 | UI framework |
| React-DOM | ^18 | DOM rendering |
| React-Router-DOM | latest | Client-side routing |
| Vite | latest | Dev server + build |
| TailwindCSS | latest | Utility CSS framework |
| Socket.io-client | latest | WebSocket client |
| WebTorrent | latest | P2P torrent streaming |

## Dev Tools

| Tool | Purpose |
|------|---------|
| Vite | HMR dev server + production bundler |
| npm | Package management (both workspaces) |
| Git | Version control |

## Infrastructure

| Component | Detail |
|-----------|--------|
| Dev server | `localhost:5173` (Vite) |
| API server | `localhost:3001` (Express) |
| Tracker | `ws://localhost:3001` (bittorrent-tracker) |
| Deployment | GitHub (TheLerin/watch-together) |
