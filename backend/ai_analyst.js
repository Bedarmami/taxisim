const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('./db');
require('dotenv').config();

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// v5.1: AI Robustness (Caching & Backoff)
let lastReport = null;
let lastPromptTime = 0;
let quotaExceededUntil = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes cache
const QUOTA_BACKOFF = 30 * 60 * 1000; // 30 minutes backoff on 429
const DAILY_QUOTA_BACKOFF = 12 * 60 * 60 * 1000; // 12 hours on daily limit (limit: 0)

/**
 * Runs a deep AI analysis on recent logs and economy state.
 */
async function runAIAnalysis() {
    if (!genAI) return "⚠️ Gemini API Key missing. AI Monitoring disabled.";

    const now = Date.now();

    // 1. Quota Backoff Check
    if (now < quotaExceededUntil) {
        const remainingHours = Math.ceil((quotaExceededUntil - now) / 3600000);
        const waitMsg = remainingHours > 1
            ? `около ${remainingHours} ч.`
            : `${Math.ceil((quotaExceededUntil - now) / 60000)} мин.`;

        return `⚠️ <b>AI находится на отдыхе (Quota/Rate Limit).</b> Попробуйте снова через ${waitMsg} Используется кэшированный отчет...<br><br>${lastReport || ''}`;
    }

    // 2. Cache Check (Throttle API calls)
    if (lastReport && (now - lastPromptTime < CACHE_DURATION)) {
        console.log('🤖 Serving cached AI report...');
        return lastReport;
    }

    try {
        // 1. Gather recent logs (optimized to 80 entries to save tokens)
        const logs = await db.query('SELECT user_id, action, details, timestamp FROM user_activity ORDER BY timestamp DESC LIMIT 80');

        // 2. Gather economy summary
        const economy = await db.get(`
            SELECT 
                (SELECT COUNT(*) FROM users) as usersCount,
                (SELECT SUM(balance) FROM users) as totalBalance,
                (SELECT MAX(balance) FROM users) as topBalance
        `);

        // Trim log details to keep tokens low
        const logContext = logs.map(l => {
            let detail = String(l.details || '');
            if (detail.length > 60) detail = detail.substring(0, 57) + '...';
            return `[${l.timestamp}] ID:${l.user_id}: ${l.action} (${detail})`;
        }).join('\n');

        const prompt = `
            Ты — эксперт-аналитик игры "Taxi Pro". Проанализируй данные и составь краткий отчет.
            
            ЭКОНОМИКА:
            - Игроков: ${economy.usersCount}
            - Общий баланс: ${economy.totalBalance || 0} PLN
            - Макс. баланс: ${economy.topBalance || 0} PLN
            
            ЛОГИ (последние):
            ${logContext}
            
            ЗАДАЧА:
            1. Выяви подозрительных игроков (спам действий, аномальный профит).
            2. Оцени здоровье экономики.
            3. Рекомендация админу (1 пункт).
            
            ФОРМАТ (HTML):
            📊 <b>ОТЧЕТ AI</b>
            ⚠️ <b>Подозрения:</b> ...
            📈 <b>Экономика:</b> ...
            💡 <b>Совет:</b> ...
        `;

        // 3. Multi-Model Fallback
        const models = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-pro"];
        let lastErr = null;

        for (const modelName of models) {
            try {
                console.log(`🤖 AI Analyst trying model: ${modelName}...`);
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(prompt);
                const reportText = result.response.text();

                // Success! Update cache
                lastReport = reportText;
                lastPromptTime = Date.now();
                quotaExceededUntil = 0;
                return reportText;

            } catch (err) {
                lastErr = err;
                console.warn(`❌ Model ${modelName} failed:`, err.message);
                // Wait 1s before trying next model to avoid overlapping rate limit logic
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        // 4. If all models failed, handle the last error
        if (lastErr) {
            const status = lastErr.status || 0;
            const msg = lastErr.message || '';
            const isQuota = status === 429 || msg.includes('429');
            const isDaily = msg.includes('limit: 0') || msg.includes('quota exceeded');

            if (isQuota) {
                quotaExceededUntil = Date.now() + (isDaily ? DAILY_QUOTA_BACKOFF : QUOTA_BACKOFF);
                return `⚠️ <b>Лимит Gemini API исчерпан.</b> ${isDaily ? 'Дневная квота пуста.' : 'Слишком много запросов.'} Анализ отключен на ${isDaily ? '12 часов' : '30 минут'}.`;
            }
        }

        return "⚠️ Ошибка AI-анализа после всех попыток.";

    } catch (e) {
        console.error('Fatal AI Analysis Error:', e);
        return "⚠️ Критическая ошибка при формировании AI отчета.";
    }
}

module.exports = { runAIAnalysis };
