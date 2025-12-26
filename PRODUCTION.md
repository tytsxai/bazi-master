# Production & Deployment Guide

## Overview
This project is containerized using Docker, allowing for a consistent production environment with separated Backend, Frontend, Postgres, and Redis services.

## Prerequisites
- Docker & Docker Compose (v2+)
- A valid `.env.production` or environment variables set in your CI/CD system (see `.env.production.example` and `docs/production-ready.md`).

## Quick Start (Production)
To run the full stack in production mode locally:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```
Before running, set required environment variables (see `.env.production.example`). You can also rename `.env.production` to `.env` to use docker compose's default env loading. For local production-mode smoke tests, you may set:
```
ALLOW_LOCALHOST_PROD=true
FRONTEND_URL=http://localhost:3000
BACKEND_BASE_URL=http://localhost:4000
```
This will spin up:
- **Frontend** (Nginx) on port `3000` (Access http://localhost:3000)
- **Backend** (Node.js) on port `4000` (Internal, but exposed for debugging if needed)
- **Postgres** (Database)
- **Redis** (Cache/Rate Limiting)

## Configuration
The `docker-compose.prod.yml` expects production values to be supplied via environment variables. For a real server, ensure you set at least the following (e.g., in a `.env.production` file loaded by compose, or exported in shell):

| Variable | Description | Default (Dev) |
|----------|-------------|---------------|
| `POSTGRES_USER` | DB User | `postgres` |
| `POSTGRES_PASSWORD` | DB Password | `postgres` |
| `POSTGRES_DB` | DB Name | `bazi_master` |
| `DATABASE_URL` | PostgreSQL connection URL | *(required in prod)* |
| `REDIS_URL` | Redis URL (required in production; used for sessions/cache) | `redis://redis:6379` |
| `FRONTEND_URL` | Public web origin | *(required in prod)* |
| `BACKEND_BASE_URL` | Public API base URL | *(required in prod)* |
| `ADMIN_EMAILS` | Admin email list | *(required for admin access)* |
| `SESSION_TOKEN_SECRET` | Secret to sign session tokens | *(required in prod)* |
| `ALLOW_LOCALHOST_PROD` | Allow localhost URLs in production-mode smoke tests | `false` |
| `CORS_ALLOWED_ORIGINS` | Extra allowed origins | *(optional)* |
| `TRUST_PROXY` | Proxy hop count | `1` in production |

## Health Checks & Observability
- **Health Check**: `GET /health` on the backend returns liveness status `200` (also `GET /api/health` for API router).
- **Readiness Check**: `GET /ready` checks DB/Redis connectivity and returns `200` or `503`.
- **Logging**: Production logs are output in JSON format for easy ingestion by tools like Datadog, ELK, or CloudWatch.
- **Metrics**: The `/health` endpoint provides basic uptime only.

## Database Migrations
The backend container is configured to automatically run `prisma migrate deploy` on startup. This ensures the database schema is always in sync with the application code.

## Architecture Notes
- **Frontend**: Served via Nginx. API requests to `/api/*` and WebSocket `/ws/*` are proxied to the backend container.
- **Backend**: Runs as a lightweight Node.js container.
- **Scaling**: The backend is stateless (using Redis for sessions) and can be scaled horizontally if needed (though `docker-compose.prod.yml` defines one replica).

## Data Backup & Restore
Scripts are provided in the `scripts/` directory for managing database backups.

### Backup
Run this on the host machine (via cron or manually):
```bash
./scripts/backup-db.sh
```
Backups are saved to `./backups/` as gzipped SQL files.

### Restore
**WARNING**: This overwrites the current database.
```bash
./scripts/restore-db.sh ./backups/bazi_master_YYYYMMDD_HHMMSS.sql.gz
```

## Security Considerations

### Environment Variables Security
- Store all secrets in environment variables, never in code
- Use different secrets for each environment (dev/staging/prod)
- Rotate secrets regularly (recommended: every 90 days)
- Use a secret management service like AWS Secrets Manager or HashiCorp Vault in production

### HTTPS Configuration
- Always use HTTPS in production
- Configure SSL/TLS certificates properly
- Enable HSTS headers for enhanced security
- Redirect all HTTP traffic to HTTPS

### CORS Configuration
- Restrict `CORS_ALLOWED_ORIGINS` to your domain only
- Use environment-specific CORS settings
- Avoid using `*` in production CORS configuration

### Rate Limiting
- Rate limiting is automatically enabled in production
- Default: 120 requests per minute per IP
- Consider implementing more sophisticated rate limiting for high-traffic endpoints

## Monitoring & Observability

### Health Checks
- **Liveness**: `GET /health` - indicates if the app is running
- **Readiness**: `GET /ready` - indicates if the app is ready to serve traffic
- Configure these endpoints in your load balancer health checks

### Logging
- Production logs are output in JSON format for easy parsing
- Include request IDs for tracing requests across services
- Log security events (failed authentications, rate limit hits)
- Monitor for error patterns and anomalies

### Metrics to Monitor
- Response times for key endpoints
- Error rates by endpoint
- Database connection pool usage
- Redis cache hit/miss rates
- Rate limiting events

### Recommended Monitoring Tools
- **Application**: Prometheus + Grafana
- **Infrastructure**: Datadog, New Relic, or AWS CloudWatch
- **Logs**: ELK Stack (Elasticsearch, Logstash, Kibana) or Loki

## Database Management

### Connection Pooling
- Configure appropriate connection pool sizes based on your workload
- Monitor connection pool usage and adjust as needed
- Use connection pooling libraries for better performance

### Backup Strategy
- Regular automated backups (daily + before deployments)
- Test restore procedures regularly
- Store backups in multiple locations (3-2-1 rule)
- Encrypt backups at rest

### Migration Safety
- Always test migrations on staging before production
- Have a rollback plan for failed migrations
- Use Prisma's migration system for safe schema changes

## CI/CD Pipeline

### GitHub Actions
A comprehensive CI/CD pipeline is configured in `.github/workflows/`:
- **Linting**: Code quality checks
- **Testing**: Backend and frontend test suites
- **Security**: Dependency vulnerability scanning
- **Build**: Docker image building and pushing
- **Deploy**: Automated deployment to staging/production

### Deployment Best Practices
1. **Blue-Green Deployments**: Deploy to a separate environment first
2. **Canary Releases**: Gradually roll out changes to a subset of users
3. **Feature Flags**: Use feature flags for risky changes
4. **Automated Rollbacks**: Ability to quickly rollback failed deployments

### Environment Promotion
- **Development** → **Staging** → **Production**
- Each environment should be identical except for configuration
- Use infrastructure as code (Docker Compose, Kubernetes, etc.)

## Performance Optimization

### Frontend
- Enable gzip compression (configured in Nginx)
- Use CDN for static assets
- Implement proper caching headers
- Optimize bundle size (< 500KB recommended)

### Backend
- Database query optimization
- Implement caching strategies (Redis)
- Use connection pooling
- Optimize API response sizes

### Scaling
- **Horizontal Scaling**: Add more container instances
- **Vertical Scaling**: Increase container resources
- **Database Scaling**: Read replicas, sharding if needed

## Troubleshooting

### Common Issues
1. **Database Connection Failures**: Check DATABASE_URL and network connectivity
2. **Redis Connection Issues**: Verify REDIS_URL and Redis service status
3. **OAuth Configuration**: Ensure callback URLs are correctly configured
4. **Rate Limiting Too Aggressive**: Adjust RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_MS

### Debug Mode
- Set `NODE_ENV=development` for detailed error messages (never in production)
- Use request IDs to trace issues across logs
- Enable debug logging temporarily for troubleshooting
