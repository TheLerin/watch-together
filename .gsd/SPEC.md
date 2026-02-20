# SPEC.md — Project Specification

> **Status**: `FINALIZED`

## Vision
A premium, real-time "Watch Together" web application that allows users to create rooms and watch synchronized videos with friends. The platform supports multiple video sources (links, YouTube, Instagram) and local/P2P file streaming without requiring centralized server storage or user accounts.

## Goals
1. Provide a stunning, dynamic, and premium UI with dark luxury aesthetics, glassmorphism, and smooth animations.
2. Implement synchronized video playback (play, pause, seek) across all connected clients.
3. Establish a 3-tier role system (Host, Moderator, Viewer) with clear permission boundaries.
4. Support diverse video sources including direct URLs, YouTube, Instagram, and local files (streamed directly from the uploader to others).
5. Enable a real-time chat area for all users in a room.

## Non-Goals (Out of Scope)
- Persistent user accounts or database-backed authentication.
- Server-side storage or hosting of uploaded video files.
- Paid subscriptions or ticketing systems.

## Users
Anyone looking to watch videos synchronously with friends online. Users join via a room link or ID using temporary nicknames.

## Roles
- **Host**: Has full control. Can kick users, promote Viewers to Moderators, add videos to the queue, play/pause, chat, and transfer the Host role to someone else.
- **Moderator** (Middle tier): Promoted by the Host. Can add videos to the queue, play/pause the video, and chat.
- **Viewer** (Normal tier): Default role upon joining. Can watch the synchronized video, participate in the chat, and change their own nickname.

## Constraints
- Local video files must be streamed/played directly from the uploader's device to other clients (P2P or relayed, but zero server-side storage).
- Zero friction entry (no login walls, just a nickname).
- The web app must adhere to modern, high-end design principles to feel exceptionally premium.

## Success Criteria
- [ ] Users can create a room and generate an invite link/ID.
- [ ] Users can join a room using a temporary nickname.
- [ ] The Host can promote a Viewer to Moderator, or transfer Host powers to someone else.
- [ ] Users with appropriate roles can add videos from links (YouTube, Instagram, direct URLs) to the playing queue.
- [ ] Users can select a local video file, which is then synchronized and viewable by everyone in the room without server storage.
- [ ] Video play, pause, and seek events are synchronized across all clients in real-time.
- [ ] All users can communicate in a real-time text chat.
- [ ] The application features a responsive, visually impressive, premium "dark luxury" design with micro-animations.
