# ROADMAP.md

> **Current Phase**: Maintenance / Enhancement
> **Milestone**: v1.0 — Feature Complete

## Must-Haves (from SPEC)

- [x] P2P video streaming via WebTorrent
- [x] Room creation and joining
- [x] Synchronized playback (play/pause/seek)
- [x] Real-time chat
- [x] Video queue with user management
- [x] Premium dark UI

## Phases

### Phase 1: Core Infrastructure
**Status**: ✅ Complete
**Objective**: Backend server with Socket.io rooms and BitTorrent tracker
**Deliverables**: `server.js`, Express routes, Socket.io event handlers, local BitTorrent tracker

### Phase 2: P2P Video Streaming
**Status**: ✅ Complete
**Objective**: WebTorrent integration — host seeds, viewers stream
**Deliverables**: `VideoPlayer.jsx`, `torrentClient.js`, magnet-based streaming

### Phase 3: Room & Queue UI
**Status**: ✅ Complete
**Objective**: Full room experience — user list, video queue, join/create flow
**Deliverables**: `RoomLayout.jsx`, `UserQueueSidebar.jsx`, `LandingPage.jsx`, `RoomContext.jsx`

### Phase 4: Premium UI Redesign
**Status**: ✅ Complete
**Objective**: Dark luxury aesthetic with glassmorphism and animations
**Deliverables**: Tailwind design system, premium components, `LandingPage.jsx` overhaul

### Phase 5: Bug Fixes & Deployment Prep
**Status**: ✅ Complete
**Objective**: Fix P2P blank screen, session persistence, localhost tracker reliability
**Deliverables**: Fixed WebTorrent stream rendering, `.env` config, GitHub deployment

### Phase 6: Future Enhancements
**Status**: ⬜ Not Started
**Objective**: Polish and new features based on usage
**Potential items**:
- [ ] Mobile responsiveness improvements
- [ ] Better error states / reconnection handling
- [ ] Subtitle support
- [ ] Room persistence via URL sharing
- [ ] Volume sync
