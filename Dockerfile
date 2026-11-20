# Use official Playwright image matching package.json version
FROM mcr.microsoft.com/playwright:v1.62.0-jammy

# Install xvfb for headful browser emulation (bypasses headless detection)
RUN apt-get update && apt-get install -y xvfb && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
RUN npx playwright install chromium

COPY . .

ENV PORT=3000
ENV HEADLESS=false
ENV DISPLAY=:99

EXPOSE 3000

# Start with xvfb-run for full GUI headful browser emulation in Linux
CMD ["xvfb-run", "--server-args=-screen 0 1280x800x24 -ac", "node", "index.js"]
