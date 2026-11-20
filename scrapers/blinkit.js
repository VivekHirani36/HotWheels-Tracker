require("dotenv").config();
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BLINKIT_STATE_PATH = path.join(__dirname, "..", "blinkit-state.json");
const SEARCH_URL = "https://blinkit.com/s/?q=hot%20wheels";

function createSlug(name) {
    if (!name) return "product";
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * Scrapes Hot Wheels products from Blinkit.
 */
async function scrapeBlinkit(options = {}) {
    const headless = options.headless !== undefined 
        ? options.headless 
        : (process.env.HEADLESS !== "false");

    if (!fs.existsSync(BLINKIT_STATE_PATH)) {
        console.warn(`[Blinkit Scraper] Warning: ${BLINKIT_STATE_PATH} not found.`);
    }

    const browser = await chromium.launch({
        headless,
        args: [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage"
        ],
    });

    let context;
    try {
        const contextOptions = {
            viewport: { width: 1280, height: 800 },
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            locale: "en-IN",
            timezoneId: "Asia/Kolkata",
        };

        if (fs.existsSync(BLINKIT_STATE_PATH)) {
            contextOptions.storageState = BLINKIT_STATE_PATH;
        }

        context = await browser.newContext(contextOptions);
        const page = await context.newPage();

        // Anti-detection patch for navigator.webdriver
        await page.addInitScript(() => {
            Object.defineProperty(navigator, "webdriver", {
                get: () => undefined,
            });
        });

        console.log(`[Blinkit Scraper] Navigating to ${SEARCH_URL}...`);
        await page.goto(SEARCH_URL, {
            waitUntil: "commit",
            timeout: options.timeout || 35000,
        });

        // Allow initial hydration
        await page.waitForTimeout(3000);
        const pageTitle = await page.title().catch(() => "unknown");
        console.log(`[Blinkit Scraper] Page loaded. Title: "${pageTitle}", URL: ${page.url()}`);

        // Wait for product cards to render
        try {
            await page.waitForSelector('div[id][role="button"], div[role="button"][tabindex="0"]', {
                timeout: 25000,
            });
        } catch (selectorErr) {
            const titleNow = await page.title().catch(() => "unknown");
            const urlNow = page.url();
            const bodyPreview = await page.innerText("body").catch(() => "");
            console.error(`[Blinkit Scraper] Selector timeout. Title: "${titleNow}", URL: "${urlNow}"`);
            console.error(`[Blinkit Scraper] Page snippet: ${bodyPreview.slice(0, 300).replace(/\n+/g, " ")}`);
            throw selectorErr;
        }

        // Smooth scroll to trigger lazy loading of cards and images
        await page.evaluate(async () => {
            const distance = 600;
            const scrollHeight = document.body.scrollHeight;
            for (let current = 0; current < scrollHeight; current += distance) {
                window.scrollBy(0, distance);
                await new Promise((r) => setTimeout(r, 120));
            }
            window.scrollTo(0, 0);
        });

        await page.waitForTimeout(800);

        // Extract and normalize all Hot Wheels product cards
        const rawProducts = await page.$$eval('div[id][role="button"]', (cards) => {
            return cards
                .filter((c) => /^\d+$/.test(c.id))
                .map((c) => {
                    const id = c.id;
                    const text = c.innerText || "";
                    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

                    const priceLine = lines.find((l) => l.includes("₹")) || "";
                    if (!priceLine) return null;

                    const deliveryLine = lines.find((l) => /\b\d+\s*(mins?|minutes?|m)\b/i.test(l)) || "10-15 mins";

                    const nameEl = c.querySelector(".tw-line-clamp-2") || 
                                   c.querySelector('[style*="line-clamp"]') || 
                                   c.querySelector("div[title]");
                    let name = nameEl ? (nameEl.getAttribute("title") || nameEl.innerText).trim() : "";
                    if (!name) {
                        name = lines.find((l) => l.toLowerCase().includes("hot wheels")) || lines[1] || lines[0] || "Hot Wheels Item";
                    }

                    const img = c.querySelector("img");
                    const image = img ? (img.src || img.getAttribute("src") || img.getAttribute("data-src") || "") : "";

                    const isOutOfStock = lines.some((l) => /out of stock/i.test(l));
                    const hasAdd = lines.some((l) => /^(ADD|Add)$/i.test(l) || l.includes("ADD"));
                    const stock = hasAdd && !isOutOfStock;

                    return {
                        id,
                        name,
                        price: priceLine,
                        delivery: deliveryLine,
                        image,
                        stock,
                    };
                })
                .filter(Boolean);
        });

        const seenIds = new Set();
        const products = [];

        for (const p of rawProducts) {
            if (seenIds.has(p.id)) continue;
            seenIds.add(p.id);

            const slug = createSlug(p.name);
            products.push({
                id: p.id,
                name: p.name,
                price: p.price,
                delivery: p.delivery,
                image: p.image,
                stock: p.stock,
                source: "Blinkit",
                url: `https://blinkit.com/prn/${slug}/prid/${p.id}`,
            });
        }

        console.log(`[Blinkit Scraper] Successfully extracted ${products.length} products.`);
        return products;

    } catch (err) {
        console.error(`[Blinkit Scraper] Extraction error:`, err.message);
        throw err;
    } finally {
        if (context) await context.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
    }
}

module.exports = scrapeBlinkit;
