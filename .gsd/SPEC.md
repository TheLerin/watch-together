# SPEC.md — Project Specification

> **Status**: `FINALIZED`

## Vision

Watch Together is a real-time collaborative video watching web application that lets friends watch local video files together in perfect sync over P2P (WebTorrent). No file uploads to servers — the host streams their video directly to viewers' browsers. Rooms are ephemeral, chat is live, and the experience should feel premium and seamless.

## Goals

1. **P2P Synchronized Playback** — Host uploads a local video; all viewers see it stream and play in sync with no server storage
2. **Room Management** — Create/join named rooms with display names; user list visible in room
3. **Video Queue** — Users can add videos to a queue; host controls progression
4. **Real-Time Chat** — In-room messaging for all participants
5. **Premium UI** — Dark luxury aesthetic with glassmorphism, smooth animations

## Non-Goals (Out of Scope)

- No user authentication / accounts
- No persistent storage (rooms are session-only)
- No server-side video transcoding
- No mobile app (web only)
- No recording/archive features

## Users

Friends watching videos together remotely. One person acts as "host" (seeds torrent), others join via room code and stream from the host.

## Constraints

- **Technical**: WebTorrent requires WebRTC support (modern browsers only)
- **Network**: P2P streaming may degrade on restrictive networks (firewalls)
- **Scale**: Designed for small groups (2–10 users per room)

## Success Criteria

- [ ] Host can load a local video and all viewers see it within 10 seconds
- [ ] Play/pause/seek on host is reflected on all viewers within 1 second
- [ ] Chat messages deliver to all room members in real-time
- [ ] UI renders correctly and looks premium on desktop browsers
- [ ] Application works on localhost for development and is deployable to a server
