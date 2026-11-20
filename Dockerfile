# Use official Playwright image matching package.json version
FROM mcr.microsoft.com/playwright:v1.62.0-jammy

WORKDIR /app
COPY package*.json ./
RUN npm install
RUN npx playwright install chromium

COPY . .

ENV PORT=3000
ENV HEADLESS=true

EXPOSE 3000

# Start Node web service and tracker
CMD ["node", "index.js"]
