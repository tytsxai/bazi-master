# BaZi Master - 全球化算命平台

## Overview
BaZi Master is a global divination platform centered on BaZi (八字), with Tarot, Zodiac, I Ching, and Zi Wei (V2) modules. It supports guest access for basic features and requires login for advanced analysis, history, favorites, and AI interpretations.

## Tech Stack
- Frontend: React + Vite, Tailwind CSS, React Router, react-i18next, ECharts
- Backend: Node.js + Express
- Database: PostgreSQL + Prisma
- Cache: Redis
- Auth: JWT + OAuth2 (Google, WeChat)
- Realtime: WebSocket for AI streaming

## Quick Start
1. Install dependencies and verify tools:
   - Node.js 18+, npm
   - PostgreSQL, Redis

## Development Setup

See `init.sh` for a quick start script or run:
```bash
./init.sh
```

## Production Deployment
For production evaluation, deployment guides, and operational scripts, please refer to [PRODUCTION.md](./PRODUCTION.md).
3. Start services in separate terminals:
   - `cd backend && npm run dev`
   - `cd frontend && npm run dev`
4. Open the app:
   - http://localhost:3000

## Project Structure
- `frontend/` React + Vite client
- `backend/` Express API server
- `prisma/` Prisma schema and migrations
- `docs/` Project documentation

## Notes
- Guest users can access basic BaZi, Zodiac, Tarot single draw, and I Ching basic divination.
- Advanced features require login.
- AI interpretation endpoints are placeholders for multiple provider integrations.
