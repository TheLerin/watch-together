## Phase 1 Decisions

**Date:** 2026-02-20

### Scope
- Setup a monorepo-style structure with separate `frontend` and `backend` folders for clean separation of concerns.
- Build the initial static UI components: Landing Page, Room Join/Create modal, and the skeleton of the Room UI (Video Player area, Chat area, Sidebar for users/queue).

### Approach
- **Frontend Framework**: React (Vite) - Chosen for fast build times, excellent developer experience, and suitability for SPA-style real-time applications.
- **Styling**: Tailwind CSS + Framer Motion + Lucide React (icons) - Chosen to achieve the premium, dark luxury aesthetic efficiently while allowing for smooth micro-animations.
- **Backend Setup**: Node.js + Express + Socket.io - Chosen for its robustness in handling real-time WebSocket connections, which is the core requirement of this application.
- **Design Inspiration**: Dark luxury aesthetic characterized by deep blacks (`#0a0a0a`), subtle dark grays for elevation, vibrant glowing accents (e.g., purple/blue gradients or striking neon colors like Google's branding colors we've used before), heavy use of glassmorphism (frosted glass effects using `backdrop-blur`), and smooth, spring-physics-based animations via Framer Motion.

### Constraints
- Ensure the initial UI components are fully responsive and look premium even on mobile devices, as users may join rooms from their phones.
- Keep the bundle size reasonable despite adding animation libraries.
