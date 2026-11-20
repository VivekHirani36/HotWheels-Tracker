# 🏎️ Multi-Platform Hot Wheels Stock Tracker & Telegram Notifier

Automated web scraper and stock monitor for **Hot Wheels** products across quick-commerce platforms (starting with Blinkit, ready for Swiggy Instamart, Zepto, and FirstCry). Dispatches instant photo alerts to Telegram whenever a new product is listed or restocked.

---

## 🚀 Running 24/7 in the Cloud (100% Free, No Credit Card)

We have pre-configured this project with a [Dockerfile](./Dockerfile) and an Express health check in [index.js](./index.js), making it ready for **Render.com**:

1. **Push to GitHub**:
   * Create a new repository on [GitHub](https://github.com/new) (keep it **Private** to protect your `.env` and `blinkit-state.json`).
   * Run:
     ```bash
     git remote add origin https://github.com/YOUR_USERNAME/hotwheels-tracker.git
     git branch -M main
     git push -u origin main
     ```

2. **Deploy on Render**:
   * Go to [Render.com](https://render.com) and sign up with GitHub (free).
   * Click **New +** > **Web Service**.
   * Select your `hotwheels-tracker` repository.
   * Runtime: Select **Docker** (it will automatically use the `Dockerfile`).
   * Instance Type: **Free**.
   * Click **Deploy Web Service**!

3. **Keep it awake 24/7**:
   * Add your free Render URL (e.g., `https://hotwheels-tracker.onrender.com`) to [UptimeRobot](https://uptimerobot.com) (free) to ping every 10 minutes so Render never sleeps.

---

## 💻 Running Locally

### 1. Interactive Mode
```bash
node index.js
```

### 2. Silent Background Mode (Windows)
To run silently in the background without keeping a terminal open:
```powershell
npm install -g pm2
pm2 start index.js --name "hotwheels-tracker"
```
To check status or stop:
```powershell
pm2 status
pm2 stop hotwheels-tracker
```
