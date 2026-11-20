require("dotenv").config();
const axios = require("axios");

const getBotToken = () => process.env.BOT_TOKEN;
const getChatId = () => process.env.CHAT_ID;

/**
 * Escapes special HTML characters for Telegram HTML mode
 * @param {string} str 
 * @returns {string}
 */
function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/**
 * Send a raw text message to Telegram
 * @param {string} message 
 * @param {object} options 
 */
async function sendMessage(message, options = {}) {
    const token = getBotToken();
    const chatId = getChatId();

    if (!token || !chatId) {
        console.warn("[Telegram] BOT_TOKEN or CHAT_ID is not configured in .env. Skipping message.");
        return;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    try {
        const response = await axios.post(url, {
            chat_id: chatId,
            text: message,
            parse_mode: options.parseMode || "HTML",
            disable_web_page_preview: options.disablePreview || false,
        }, { timeout: 10000 });
        return response.data;
    } catch (err) {
        console.error(`[Telegram] Error sending message:`, err.response?.data || err.message);
        throw err;
    }
}

/**
 * Format and send a single product alert to Telegram (with photo if available)
 * @param {object} product 
 * @param {'NEW' | 'RESTOCKED'} alertType 
 */
async function sendProductAlert(product, alertType = "NEW") {
    const token = getBotToken();
    const chatId = getChatId();

    if (!token || !chatId) {
        console.warn("[Telegram] BOT_TOKEN or CHAT_ID missing. Skipping product alert.");
        return;
    }

    const header = alertType === "NEW" 
        ? "🚨 <b>NEW HOT WHEELS LISTING DETECTED!</b>" 
        : "⚡ <b>HOT WHEELS RESTOCKED!</b>";

    const caption = [
        header,
        "",
        `🏎️ <b>Product:</b> ${escapeHtml(product.name)}`,
        `💰 <b>Price:</b> ${escapeHtml(product.price || "N/A")}`,
        `⏱️ <b>Delivery:</b> ${escapeHtml(product.delivery || "N/A")}`,
        `🏪 <b>Platform:</b> ${escapeHtml(product.source || "Blinkit")}`,
        `📦 <b>Status:</b> ${product.stock ? "In Stock ✅" : "Out of Stock ❌"}`,
        "",
        `🔗 <a href="${product.url}">Open in ${escapeHtml(product.source || "Blinkit")}</a>`
    ].join("\n");

    // Try sending with photo first
    if (product.image && product.image.startsWith("http")) {
        try {
            const photoUrl = `https://api.telegram.org/bot${token}/sendPhoto`;
            await axios.post(photoUrl, {
                chat_id: chatId,
                photo: product.image,
                caption: caption,
                parse_mode: "HTML",
            }, { timeout: 10000 });
            console.log(`[Telegram] Sent photo alert for: ${product.name}`);
            return;
        } catch (photoErr) {
            console.warn(`[Telegram] Photo alert failed, falling back to text: ${photoErr.message}`);
        }
    }

    // Fallback to text message
    await sendMessage(caption, { parseMode: "HTML" });
    console.log(`[Telegram] Sent text alert for: ${product.name}`);
}

/**
 * Send alerts for a list of products sequentially
 * @param {Array<object>} alerts - Products with alertType property
 */
async function sendProductAlerts(alerts = []) {
    for (const item of alerts) {
        try {
            await sendProductAlert(item, item.alertType || "NEW");
            // Rate limit buffer between Telegram alerts
            await new Promise((resolve) => setTimeout(resolve, 1200));
        } catch (err) {
            console.error(`[Telegram] Failed to send alert for "${item.name}":`, err.message);
        }
    }
}

module.exports = {
    sendMessage,
    sendProductAlert,
    sendProductAlerts,
};
