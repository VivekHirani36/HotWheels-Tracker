require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const scrapeBlinkit = require("./scrapers/blinkit");
const { loadDatabase, compareAndUpdate } = require("./utils/compare");
const { sendMessage, sendProductAlerts } = require("./services/telegram");

// Configuration
const POLL_INTERVAL_SECONDS = parseInt(process.env.POLL_INTERVAL_SECONDS, 10) || 45;
const JITTER_SECONDS = 10;
const PORT = process.env.PORT || 3000;
const BLINKIT_STATE_PATH = path.join(__dirname, "blinkit-state.json");

// Multi-platform scraper registry
const scrapers = [
    { name: "Blinkit", run: scrapeBlinkit },
];

let isRunning = false;
let runCount = 0;
let lastCycleTime = null;
let lastCycleStatus = "Starting up...";

/**
 * Lightweight HTTP server for Cloud Hosting (Render) health checks
 */
const app = express();

app.get("/", (req, res) => {
    const db = loadDatabase();
    res.json({
        status: "online",
        service: "Hot Wheels Stock Tracker",
        runCount,
        lastCycle: lastCycleTime || "Starting up...",
        lastCycleStatus,
        productsTracked: db.length,
        platforms: scrapers.map((s) => s.name),
        debugUrl: "/debug",
    });
});

/**
 * Live visual debug endpoint - renders a live screenshot of Blinkit
 */
app.get("/debug", async (req, res) => {
    let browser;
    try {
        const { chromium } = require("playwright");
        browser = await chromium.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        });
        const context = await browser.newContext({
            storageState: fs.existsSync(BLINKIT_STATE_PATH) ? BLINKIT_STATE_PATH : undefined,
            viewport: { width: 1280, height: 800 },
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        });
        const page = await context.newPage();
        await page.goto("https://blinkit.com/s/?q=hot%20wheels", { waitUntil: "commit", timeout: 30000 });
        await page.waitForTimeout(4000);

        const title = await page.title().catch(() => "N/A");
        const url = page.url();
        const text = await page.innerText("body").catch(() => "");
        const screenshot = await page.screenshot({ encoding: "base64" });
        await browser.close();

        res.send(`
            <html>
            <head><title>Hot Wheels Tracker - Cloud Debug</title></head>
            <body style="font-family:sans-serif;padding:20px;background:#f9f9f9">
                <h2>🏎️ Hot Wheels Tracker - Live Cloud Inspection</h2>
                <p><b>URL:</b> ${url}</p>
                <p><b>Page Title:</b> ${title}</p>
                <p><b>State File Found:</b> ${fs.existsSync(BLINKIT_STATE_PATH)}</p>
                <details>
                    <summary><b>Page Text Content (First 1000 chars)</b></summary>
                    <pre style="background:#eee;padding:10px;border-radius:6px;max-height:200px;overflow:auto">${text.slice(0, 1000)}</pre>
                </details>
                <h3>Live Browser Screenshot from Render:</h3>
                <img src="data:image/png;base64,${screenshot}" style="max-width:100%;border:2px solid #333;border-radius:8px" />
            </body>
            </html>
        `);
    } catch (e) {
        if (browser) await browser.close().catch(() => {});
        res.status(500).send("Debug error: " + e.message);
    }
});

// Explicitly bind to 0.0.0.0 so Render port scanner detects it immediately
app.listen(PORT, "0.0.0.0", () => {
    console.log(`[HealthCheck] Web service active on 0.0.0.0:${PORT}`);
});

/**
 * Single monitoring cycle across all registered platforms
 */
async function runMonitoringCycle() {
    if (isRunning) {
        console.log("[Scheduler] Previous cycle is still running. Skipping this tick.");
        return;
    }

    isRunning = true;
    runCount++;
    lastCycleTime = new Date().toISOString();
    console.log(`\n==================================================`);
    console.log(`[Scheduler] Cycle #${runCount} started at ${new Date().toLocaleTimeString()}`);
    console.log(`==================================================`);

    try {
        const existingDb = loadDatabase();
        const isFirstRun = existingDb.length === 0;

        for (const scraper of scrapers) {
            console.log(`\n[Tracker] Running scraper for: ${scraper.name}`);
            try {
                const scrapedProducts = await scraper.run();
                console.log(`[Tracker] ${scraper.name} returned ${scrapedProducts.length} items.`);

                if (isFirstRun) {
                    console.log(`[Tracker] First-run detected: Seeding database without sending spam alerts...`);
                    const result = compareAndUpdate(scrapedProducts, { isInitialSeed: true });
                    console.log(`[Tracker] Seeded database with ${result.totalKnown} initial items.`);
                    lastCycleStatus = `Seeded ${result.totalKnown} items`;

                    // Send startup confirmation to Telegram
                    await sendMessage(
                        `🏎️ <b>Hot Wheels Tracker Activated!</b>\n` +
                        `✅ Initialized tracking for <b>${scraper.name}</b>.\n` +
                        `📦 Catalog initialized with <b>${result.totalKnown}</b> products.\n` +
                        `⏱️ Checking every ~${POLL_INTERVAL_SECONDS}s for new drops and restocks!`
                    ).catch((e) => console.warn("[Telegram] Startup message skipped:", e.message));

                } else {
                    const result = compareAndUpdate(scrapedProducts, { isInitialSeed: false });
                    console.log(`[Tracker] Diff Result: New: ${result.newProducts.length}, Restocked: ${result.restockedProducts.length}, Total in DB: ${result.totalKnown}`);
                    lastCycleStatus = `Scraped ${scrapedProducts.length} items (New: ${result.newProducts.length}, Restocked: ${result.restockedProducts.length})`;

                    if (result.alerts.length > 0) {
                        console.log(`[Tracker] 🚀 Found ${result.alerts.length} alert(s)! Dispatching to Telegram...`);
                        await sendProductAlerts(result.alerts);
                    } else {
                        console.log(`[Tracker] No new drops or restocks found in this cycle.`);
                    }
                }

            } catch (scraperErr) {
                lastCycleStatus = `Error: ${scraperErr.message}`;
                console.error(`[Tracker] Error during ${scraper.name} cycle:`, scraperErr.message);
            }
        }

    } catch (err) {
        lastCycleStatus = `Scheduler error: ${err.message}`;
        console.error(`[Scheduler] Unexpected error during monitoring cycle:`, err.message);
    } finally {
        isRunning = false;
        const jitter = Math.floor(Math.random() * JITTER_SECONDS);
        const nextDelaySeconds = POLL_INTERVAL_SECONDS + jitter;
        console.log(`[Scheduler] Cycle finished. Next check in ${nextDelaySeconds} seconds...\n`);
        setTimeout(runMonitoringCycle, nextDelaySeconds * 1000);
    }
}

// Start tracking loop
console.log("==================================================");
console.log("🏎️  Multi-Platform Hot Wheels Stock Tracker");
console.log(`⏱️  Polling Interval: ${POLL_INTERVAL_SECONDS}s (with random jitter)`);
console.log("==================================================");

runMonitoringCycle();
