const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function listModels() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error("No API key found in .env");
        return;
    }
    const genAI = new GoogleGenerativeAI(key);
    try {
        console.log("Listing models...");
        // In the newer SDKs, listing models might be different or not directly supported via genAI object
        // but we can try common ones and see the exact error.

        const models = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro", "gemini-pro", "gemini-1.5-flash-8b"];
        for (const m of models) {
            try {
                const model = genAI.getGenerativeModel({ model: m });
                const result = await model.generateContent("test");
                console.log(`✅ Model ${m} is working!`);
            } catch (e) {
                console.log(`❌ Model ${m} failed: ${e.message}`);
            }
        }
    } catch (e) {
        console.error("List error:", e);
    }
}

listModels();
