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

# Switch Prisma provider to postgresql for production build
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/g' ../prisma/schema.prisma

# Generate Prisma Client
RUN npm run prisma:generate

# Expose port
EXPOSE 4000

# Start command
CMD ["npm", "run", "start"]
