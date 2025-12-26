# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Refreshed documentation to reflect current routes, configuration, and stack.

### Changed
- Simplified README/PRODUCTION to remove unverifiable metrics and align with actual code.
- Harmonized architecture/development/API docs with current directory structure and runtime behavior.

### Fixed
- Corrected outdated references to non-existent files and APIs (e.g., legacy service duplicates, password reset endpoints).

## [0.1.1] - 2025-12-27
### Added
- **Production Readiness**: Added `/health` (liveness) and `/api/ready` (readiness) endpoints.
- **Reliability**: Implemented Redis-based session storage and cache mirroring for multi-instance deployments.
- **Testing**: Configured Playwright retries and `data-testid` selectors for robust E2E testing.
- **Tooling**: Added `npm run analyze` for frontend bundle visualization.

## [0.1.0] - 2025-12-26
### Added
- Core domain modules: BaZi calculation & records, Tarot draw & history, I Ching divination, Zodiac info/horoscope/compatibility/rising, Zi Wei charting, Favorites.
- Authentication: register, login, logout, session token storage, self-delete.
- Health/readiness endpoints and basic rate limiting & CORS controls.
- Frontend React SPA with i18n, routing, and Playwright E2E specs.
- Prisma schema with initial migration targeting SQLite (dev) and PostgreSQL (prod).

[Unreleased]: https://github.com/tytsxai/bazi-master/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/tytsxai/bazi-master/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/tytsxai/bazi-master/releases/tag/v0.1.0
