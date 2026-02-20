# ROADMAP.md

> **Current Phase**: Not started
> **Milestone**: v1.0

## Must-Haves (from SPEC)
- [ ] Room creation and joining via link/ID with temporary nicknames.
- [ ] 3-tier role system (Host, Moderator, Viewer) with promotion/demotion.
- [ ] Real-time synchronized video playback (play, pause, seek).
- [ ] Support for video URLs (YouTube, Instagram, direct) and local file streaming from the uploader.
- [ ] Real-time text chat.
- [ ] Premium, dark luxury UI with glassmorphism.

## Phases

### Phase 1: Foundation & UI Design
**Status**: ⬜ Not Started
**Objective**: Setup the project architecture (Frontend & Backend), establish the design system (Premium Dark UI, Tailwind/Vanilla CSS), and build the core static UI components (Landing Page, Room UI boilerplate).

### Phase 2: Real-time Infrastructure & Rooms
**Status**: ⬜ Not Started
**Objective**: Implement WebSocket (Socket.io) connections. Allow users to create rooms, join with nicknames, and implement the real-time chat feature.

### Phase 3: Identity & Role Management
**Status**: ⬜ Not Started
**Objective**: Develop the 3-tier role system in memory. Allow the Host to promote Viewers to Moderators, kick users, and transfer the Host role. Enforce permissions on socket events.

### Phase 4: Video Synchronization & External Players
**Status**: ⬜ Not Started
**Objective**: Integrate video players capable of handling YouTube, external links, etc. (e.g., ReactPlayer or custom wrappers). Implement synchronized play, pause, and seek events across all clients.

### Phase 5: P2P Local Video Streaming
**Status**: ⬜ Not Started
**Objective**: Implement WebRTC or chunked WebSockets to support playing local video files directly from the uploader's machine without server storage, synchronizing the stream with all viewers.

### Phase 6: Polish & Launch
**Status**: ⬜ Not Started
**Objective**: Final UI refinement, micro-animations, bug fixing, thorough testing of testing synchronization edge cases (e.g., late joiners), and deployment preparation.
