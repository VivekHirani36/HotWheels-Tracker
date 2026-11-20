require("dotenv").config();
const express = require("express");
const scrapeBlinkit = require("./scrapers/blinkit");
const { loadDatabase, compareAndUpdate } = require("./utils/compare");
const { sendMessage, sendProductAlerts } = require("./services/telegram");

// Configuration
const POLL_INTERVAL_SECONDS = parseInt(process.env.POLL_INTERVAL_SECONDS, 10) || 45;
const JITTER_SECONDS = 10; // Random jitter between 0 and 10s to avoid static cadence patterns
const PORT = process.env.PORT || 3000;

// Multi-platform scraper registry
const scrapers = [
    { name: "Blinkit", run: scrapeBlinkit },
    // Future platform extensions:
    // { name: "Swiggy Instamart", run: scrapeSwiggy },
    // { name: "Zepto", run: scrapeZepto },
    // { name: "FirstCry", run: scrapeFirstCry },
];

let isRunning = false;
let runCount = 0;
let lastCycleTime = null;

/**
 * Lightweight HTTP server for Cloud Hosting (Render, Railway, Koyeb) health checks
 */
const app = express();
app.get("/", (req, res) => {
    const db = loadDatabase();
    res.json({
        status: "online",
        service: "Hot Wheels Stock Tracker",
        runCount,
        lastCycle: lastCycleTime || "Starting up...",
        productsTracked: db.length,
        platforms: scrapers.map((s) => s.name),
    });
});

app.listen(PORT, () => {
    console.log(`[HealthCheck] Web service active on port ${PORT}`);
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

                    if (result.alerts.length > 0) {
                        console.log(`[Tracker] 🚀 Found ${result.alerts.length} alert(s)! Dispatching to Telegram...`);
                        await sendProductAlerts(result.alerts);
                    } else {
                        console.log(`[Tracker] No new drops or restocks found in this cycle.`);
                    }
                }

            } catch (scraperErr) {
                console.error(`[Tracker] Error during ${scraper.name} cycle:`, scraperErr.message);
            }
        }

    } catch (err) {
        console.error(`[Scheduler] Unexpected error during monitoring cycle:`, err.message);
    } finally {
        isRunning = false;
        
        // Compute next delay with random jitter
        const jitter = Math.floor(Math.random() * JITTER_SECONDS);
        const nextDelaySeconds = POLL_INTERVAL_SECONDS + jitter;
        console.log(`[Scheduler] Cycle finished. Next check in ${nextDelaySeconds} seconds...\n`);
        setTimeout(runMonitoringCycle, nextDelaySeconds * 1000);
    }
}

// Graceful termination handling
process.on("SIGINT", () => {
    console.log("\n[Hot Wheels Tracker] Shutting down gracefully...");
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("\n[Hot Wheels Tracker] Terminated.");
    process.exit(0);
});

// Start tracking loop
console.log("==================================================");
console.log("🏎️  Multi-Platform Hot Wheels Stock Tracker");
console.log(`⏱️  Polling Interval: ${POLL_INTERVAL_SECONDS}s (with random jitter)`);
console.log("==================================================");

runMonitoringCycle();
