# Use official Playwright image containing Chromium and all Linux dependencies
FROM mcr.microsoft.com/playwright:v1.42.0-jammy

# Set working directory
WORKDIR /app

# Copy package manifests and install dependencies
COPY package*.json ./
RUN npm install

# Copy project source code and session files
COPY . .

# Set environment defaults for cloud
ENV PORT=3000
ENV HEADLESS=true

# Expose healthcheck port
EXPOSE 3000

# Start tracker and web server
CMD ["node", "index.js"]
