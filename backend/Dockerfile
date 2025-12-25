FROM node:18-alpine

WORKDIR /app

# Copy root files needed for structure
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Setup Backend
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./

# Install dependencies
RUN npm ci

# Copy backend source code
COPY backend ./

# Generate Prisma Client
RUN npm run prisma:generate

# Expose port
EXPOSE 4000

# Start command
CMD ["npm", "run", "start"]
