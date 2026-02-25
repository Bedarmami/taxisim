const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('./db');
require('dotenv').config();

// v5.6: AI Multi-Key & Provider
const geminiKeys = (process.env.GEMINI_API_KEY || "").split(',').map(k => k.trim()).filter(k => k);
const grokKey = process.env.GROK_API_KEY || "";

/**
 * Runs a deep AI analysis on recent logs and economy state.
 */
async function runAIAnalysis() {
    if (geminiKeys.length === 0 && !grokKey) return "⚠️ AI API Keys missing. AI Monitoring disabled.";

    const now = Date.now();

    // 1. Quota Backoff Check
    if (now < quotaExceededUntil) {
        const remainingHours = Math.ceil((quotaExceededUntil - now) / 3600000);
        const waitMsg = remainingHours > 1
            ? `около ${remainingHours} ч.`
            : `${Math.ceil((quotaExceededUntil - now) / 60000)} мин.`;

        return `⚠️ <b>AI на отдыхе (Quota).</b> Доступ через ${waitMsg}<br><br>${lastReport || ''}`;
    }

    // 2. Cache Check (Throttle API calls)
    if (lastReport && (now - lastPromptTime < CACHE_DURATION)) {
        console.log('🤖 Serving cached AI report...');
        return lastReport;
    }

    try {
        // 1. Gather recent logs (optimized to 80 entries)
        const logs = await db.query('SELECT user_id, action, details, timestamp FROM user_activity ORDER BY timestamp DESC LIMIT 80');
        const economy = await db.get(`
            SELECT 
                (SELECT COUNT(*) FROM users) as usersCount,
                (SELECT SUM(balance) FROM users) as totalBalance,
                (SELECT MAX(balance) FROM users) as topBalance
        `);

        // Trim log details
        const logContext = logs.map(l => {
            let detail = String(l.details || '');
            if (detail.length > 60) detail = detail.substring(0, 57) + '...';
            return `[${l.timestamp}] ID:${l.user_id}: ${l.action} (${detail})`;
        }).join('\n');

        const prompt = `
            Ты — эксперт-аналитик игры "Taxi Pro". Проанализируй данные и составь краткий отчет (HTML).
            Игроков: ${economy.usersCount}, Баланс: ${economy.totalBalance || 0} PLN.
            ЛОГИ:
            ${logContext}
            
            ФОРМАТ:
            📊 <b>ОТЧЕТ AI</b>
            ⚠️ <b>Подозрения:</b> ...
            📈 <b>Экономика:</b> ...
            💡 <b>Совет:</b> ...
        `;

        // 3. Try Gemini Keys in rotation
        const models = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"];

        for (const key of geminiKeys) {
            const genAI = new GoogleGenerativeAI(key);
            for (const modelName of models) {
                try {
                    console.log(`🤖 AI Analyst trying Gemini key (...${key.slice(-4)}) model: ${modelName}...`);
                    const model = genAI.getGenerativeModel({ model: modelName });
                    const result = await model.generateContent(prompt);
                    const reportText = result.response.text();

                    lastReport = reportText;
                    lastPromptTime = Date.now();
                    quotaExceededUntil = 0;
                    return reportText;
                } catch (err) {
                    const msg = err.message || "";
                    console.warn(`❌ Gemini ${modelName} failed with key ...${key.slice(-4)}:`, msg);
                    if (msg.includes('429') || msg.includes('quota')) break; // Try next KEY
                    if (msg.includes('404')) continue; // Try next model for same key
                    break; // Unexpected error, try next key
                }
            }
        }

        // 4. Try Grok Fallback
        if (grokKey) {
            try {
                console.log("🤖 Gemini exhausted. Trying Grok (xAI) fallback...");
                const response = await fetch("https://api.x.ai/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${grokKey}`
                    },
                    body: JSON.stringify({
                        messages: [
                            { role: "system", content: "You are a professional taxi business analyst." },
                            { role: "user", content: prompt }
                        ],
                        model: "grok-beta", // User suggested grok-4-latest, but beta is more standard for fallback
                        stream: false,
                        temperature: 0.7
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    const reportText = data.choices[0].message.content;
                    lastReport = reportText;
                    lastPromptTime = Date.now();
                    quotaExceededUntil = 0;
                    console.log("✅ Grok analysis successful!");
                    return reportText;
                } else {
                    console.error("❌ Grok API error:", response.status);
                }
            } catch (err) {
                console.error("❌ Grok fallback failed:", err.message);
            }
        }

        if (lastReport) return lastReport;
        return "⚠️ Все AI-провайдеры исчерпаны.";

    } catch (e) {
        console.error('Fatal AI Analysis Error:', e);
        return "⚠️ Критическая ошибка при формировании AI отчета.";
    }
}

module.exports = { runAIAnalysis };
