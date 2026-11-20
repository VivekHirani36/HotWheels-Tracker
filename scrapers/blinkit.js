require("dotenv").config();
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BLINKIT_STATE_PATH = path.join(__dirname, "..", "blinkit-state.json");
const SEARCH_URL = "https://blinkit.com/s/?q=hot%20wheels";

/**
 * Normalizes a product name into a clean URL slug
 * @param {string} name 
 * @returns {string}
 */
function createSlug(name) {
    if (!name) return "product";
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * Scrapes Hot Wheels products from Blinkit.
 * 
 * @param {object} options
 * @param {boolean} [options.headless=false] - Run headless or with visible window
 * @param {number} [options.timeout=35000] - Navigation timeout in ms
 * @returns {Promise<Array<object>>} Standardized product objects
 */
async function scrapeBlinkit(options = {}) {
    const headless = options.headless !== undefined 
        ? options.headless 
        : (process.env.HEADLESS === "true");

    if (!fs.existsSync(BLINKIT_STATE_PATH)) {
        console.warn(`[Blinkit Scraper] Warning: ${BLINKIT_STATE_PATH} not found. Run 'node login.js' first to save delivery location session.`);
    }

    const browser = await chromium.launch({
        headless,
        slowMo: 100,
        args: [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-setuid-sandbox"
        ],
    });

    let context;
    try {
        if (fs.existsSync(BLINKIT_STATE_PATH)) {
            context = await browser.newContext({
                storageState: BLINKIT_STATE_PATH,
                viewport: { width: 1280, height: 800 },
                userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            });
        } else {
            context = await browser.newContext({
                viewport: { width: 1280, height: 800 },
            });
        }

        const page = await context.newPage();

        console.log(`[Blinkit Scraper] Navigating to ${SEARCH_URL}...`);
        await page.goto(SEARCH_URL, {
            waitUntil: "commit",
            timeout: options.timeout || 35000,
        });

        // Wait for product cards to render
        await page.waitForSelector('div[id][role="button"], div[role="button"][tabindex="0"]', {
            timeout: 20000,
        });

        // Smooth scroll down to trigger lazy loading of cards and images
        await page.evaluate(async () => {
            const distance = 600;
            const scrollHeight = document.body.scrollHeight;
            for (let current = 0; current < scrollHeight; current += distance) {
                window.scrollBy(0, distance);
                await new Promise((r) => setTimeout(r, 120));
            }
            // Scroll back up to ensure top images are refreshed in viewport
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

                    // Price line contains ₹
                    const priceLine = lines.find((l) => l.includes("₹")) || "";
                    if (!priceLine) return null;

                    // Delivery time
                    const deliveryLine = lines.find((l) => /\b\d+\s*(mins?|minutes?|m)\b/i.test(l)) || "10-15 mins";

                    // Product title/name
                    const nameEl = c.querySelector(".tw-line-clamp-2") || 
                                   c.querySelector('[style*="line-clamp"]') || 
                                   c.querySelector("div[title]");
                    let name = nameEl ? (nameEl.getAttribute("title") || nameEl.innerText).trim() : "";
                    if (!name) {
                        name = lines.find((l) => l.toLowerCase().includes("hot wheels")) || lines[1] || lines[0] || "Hot Wheels Item";
                    }

                    // Image URL
                    const img = c.querySelector("img");
                    const image = img ? (img.src || img.getAttribute("src") || img.getAttribute("data-src") || "") : "";

                    // Stock status
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

        // Deduplicate and finalize URL construction
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
