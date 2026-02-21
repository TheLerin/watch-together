# DECISIONS.md — Architecture Decision Records

> Log of key technical decisions and their rationale

---

## ADR-001: P2P Streaming via WebTorrent

**Date**: 2026-02-09
**Status**: Accepted

**Context**: Need to stream host's local video to all viewers without uploading to a server.

**Decision**: Use WebTorrent. Host seeds the file as a torrent; viewers connect via magnet link.

**Rationale**: No server storage costs, zero upload wait time, works in modern browsers via WebRTC.

**Trade-offs**: Requires WebRTC-capable browsers. May struggle on restrictive networks.

---

## ADR-002: Local BitTorrent Tracker

**Date**: 2026-02-20
**Status**: Accepted

**Context**: WebTorrent P2P on localhost failed because no tracker was available for peer discovery.

**Decision**: Run `bittorrent-tracker` on the backend alongside Socket.io.

**Rationale**: Enables reliable peer discovery on localhost and LAN without external tracker dependency.

**Trade-offs**: One more service to configure in production.

---

## ADR-003: React Context for Room State

**Date**: 2026-02-09
**Status**: Accepted

**Context**: Multiple components need access to room info, user list, queue, and chat.

**Decision**: `RoomContext.jsx` provides global state via React Context API.

**Rationale**: Simple, no extra dependency (vs Redux/Zustand). Scale is small enough.

**Trade-offs**: Context re-renders can be expensive if overused; acceptable for this app size.

---

## ADR-004: TailwindCSS for Styling

**Date**: 2026-02-09
**Status**: Accepted

**Context**: Need rapid styling with consistent design tokens.

**Decision**: TailwindCSS utility-first framework.

**Rationale**: Fast iteration, no CSS file bloat, integrates well with Vite.

**Trade-offs**: Class names can be verbose. Accepted.

---

## ADR-005: Socket.io for Signaling

**Date**: 2026-02-09
**Status**: Accepted

**Context**: Need real-time bidirectional events for room management, playback sync, chat.

**Decision**: Socket.io (server + client).

**Rationale**: Mature, reliable, handles reconnection automatically, easy room/broadcast model.

**Trade-offs**: Larger bundle than raw WebSocket. Acceptable.
