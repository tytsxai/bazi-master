FROM node:20-alpine

WORKDIR /app

# Install system dependencies (Prisma needs OpenSSL)
RUN apk add --no-cache openssl

# Copy root files needed for structure
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Setup Backend
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
COPY backend/scripts ./scripts

# Install dependencies
RUN npm ci

# Copy backend source code
COPY backend ./

# Generate Prisma Client
RUN npm run prisma:generate

# Drop root. Everything under /app is build output, so a single chown is enough.
RUN chown -R node:node /app
USER node

# Expose port
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/live').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Start command
CMD ["npm", "run", "start"]
