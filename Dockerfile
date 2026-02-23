# Use official Node.js image
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY backend/package*.json ./backend/

# Install dependencies
RUN cd backend && npm install --production

# Copy the rest of the application
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Create data directory for SQLite
RUN mkdir -p /app/backend/data

# Environment variables (can be overridden by Railway)
ENV PORT=3000
ENV NODE_ENV=production

# Expose the port
EXPOSE 3000

# Start the application
CMD ["node", "backend/server.js"]
