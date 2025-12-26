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

## Environment Variables
Copy `env.example` to `.env` in the backend directory and configure the following variables for development:

```bash
# Database
DATABASE_URL="file:./dev.db"  # SQLite for development
# DATABASE_URL="postgresql://user:password@localhost:5432/bazi_master"  # PostgreSQL for production

# Session & Security
SESSION_TOKEN_SECRET="your-32-char-secret-here"
ADMIN_EMAILS="admin@example.com"

# External Services (optional)
REDIS_URL="redis://localhost:6379"
OPENAI_API_KEY="your-openai-key"
ANTHROPIC_API_KEY="your-anthropic-key"

# OAuth (optional)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
WECHAT_APP_ID="your-wechat-app-id"
WECHAT_APP_SECRET="your-wechat-app-secret"
```

## Development Setup
2. Start services in separate terminals:
   - `cd backend && npm run dev`
   - `cd frontend && npm run dev`
3. Open the app:
   - http://localhost:3000

## Project Structure
- `frontend/` React + Vite client
- `backend/` Express API server with modular architecture
- `prisma/` Prisma schema and migrations
- `docs/` Project documentation
- `scripts/` Database backup and maintenance scripts
- `docker/` Containerization configurations

## API Documentation
- API endpoints are available at `/api-docs` (requires admin authentication)
- Health check: `GET /health`
- Readiness check: `GET /ready`

## Testing
- Backend tests: `cd backend && npm test`
- Frontend tests: `cd frontend && npm run test`
- Full test suite: `npm run test:all`

## Features
- **Guest Access**: Basic BaZi calculations, Zodiac queries, single Tarot draws, and I Ching divination
- **Registered Users**: Full analysis, history, favorites, AI interpretations, and multi-record comparisons
- **AI Integration**: Support for OpenAI, Anthropic, and other AI providers
- **Internationalization**: English and Chinese language support
- **OAuth**: Google and WeChat social login
- **Real-time**: WebSocket support for streaming AI responses

## Contributing
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes and add tests
4. Run tests: `npm run test:all`
5. Commit your changes: `git commit -am 'Add new feature'`
6. Push to the branch: `git push origin feature/your-feature`
7. Submit a pull request

## License
This project is licensed under the MIT License - see the LICENSE file for details.
