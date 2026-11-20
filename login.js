const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch({
        headless: false
    });

    const context = await browser.newContext();

    const page = await context.newPage();

    await page.goto("https://blinkit.com");

    console.log("Login and set your delivery location.");
    console.log("When you're done, press ENTER in the terminal.");

    process.stdin.once("data", async () => {
        await context.storageState({
            path: "blinkit-state.json"
        });

        console.log("Session saved!");

        await browser.close();
        process.exit();
    });

})();