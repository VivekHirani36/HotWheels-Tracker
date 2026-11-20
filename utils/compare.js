const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(__dirname, "..", "database", "products.json");

/**
 * Load all products currently stored in the database.
 * Returns an array of standardized product objects.
 * @returns {Array<object>}
 */
function loadDatabase() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
            fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2), "utf-8");
            return [];
        }
        const data = fs.readFileSync(DB_FILE, "utf-8");
        return JSON.parse(data || "[]");
    } catch (err) {
        console.error("[Database] Error reading database/products.json:", err.message);
        return [];
    }
}

/**
 * Save products array to database/products.json
 * @param {Array<object>} products 
 */
function saveDatabase(products) {
    try {
        fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
        fs.writeFileSync(DB_FILE, JSON.stringify(products, null, 2), "utf-8");
    } catch (err) {
        console.error("[Database] Error saving database/products.json:", err.message);
    }
}

/**
 * Generates a unique key for product comparison across sources.
 * Standard format: `${source.toLowerCase()}_${id}` or fallback to `${source.toLowerCase()}_${cleanName}`
 * @param {object} p 
 * @returns {string}
 */
function getProductKey(p) {
    const source = (p.source || "unknown").toLowerCase().trim();
    if (p.id) {
        return `${source}_${String(p.id).trim()}`;
    }
    const cleanName = (p.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return `${source}_${cleanName}`;
}

/**
 * Compares newly scraped products against existing database.
 * 
 * @param {Array<object>} scrapedProducts - Newly scraped products from a source
 * @param {object} options
 * @param {boolean} [options.isInitialSeed=false] - If true, saves initial state without firing alerts
 * @returns {object} {
 *    newProducts: Array,
 *    restockedProducts: Array,
 *    alerts: Array, // Combined list of alert objects with alertType: 'NEW' | 'RESTOCKED'
 *    totalKnown: number
 * }
 */
function compareAndUpdate(scrapedProducts = [], options = {}) {
    const { isInitialSeed = false } = options;
    const existingDb = loadDatabase();

    // Map existing products by key
    const dbMap = new Map();
    for (const item of existingDb) {
        dbMap.set(getProductKey(item), item);
    }

    const newProducts = [];
    const restockedProducts = [];
    const alerts = [];

    // Compare each freshly scraped product
    for (const fresh of scrapedProducts) {
        const key = getProductKey(fresh);
        const existing = dbMap.get(key);

        if (!existing) {
            // Brand new product listing
            newProducts.push(fresh);
            if (!isInitialSeed && fresh.stock) {
                alerts.push({ ...fresh, alertType: "NEW" });
            }
        } else {
            // Existing product: check if restocked (previously out-of-stock, now in-stock)
            if (!existing.stock && fresh.stock) {
                restockedProducts.push(fresh);
                if (!isInitialSeed) {
                    alerts.push({ ...fresh, alertType: "RESTOCKED" });
                }
            }
        }

        // Update record with latest details and timestamp
        dbMap.set(key, {
            ...(existing || {}),
            ...fresh,
            lastSeen: new Date().toISOString(),
        });
    }

    // Save updated catalog to disk
    const updatedDb = Array.from(dbMap.values());
    saveDatabase(updatedDb);

    return {
        newProducts,
        restockedProducts,
        alerts,
        totalKnown: updatedDb.length,
    };
}

module.exports = {
    loadDatabase,
    saveDatabase,
    getProductKey,
    compareAndUpdate,
};
