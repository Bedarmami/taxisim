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

/**
 * Runs a deep AI analysis on recent logs and economy state.
 */
async function runAIAnalysis() {
    if (!genAI) return "⚠️ Gemini API Key missing. AI Monitoring disabled.";

    const now = Date.now();

    // 1. Quota Backoff Check
    if (now < quotaExceededUntil) {
        const remaining = Math.ceil((quotaExceededUntil - now) / 60000);
        return `⚠️ <b>AI находится на отдыхе (Quota 429).</b> Попробуйте снова через ${remaining} мин. Используется кэшированный отчет...<br><br>${lastReport || ''}`;
    }

    // 2. Cache Check (Throttle API calls)
    if (lastReport && (now - lastPromptTime < CACHE_DURATION)) {
        console.log('🤖 Serving cached AI report...');
        return lastReport;
    }

    try {
        // 1. Gather recent logs (last 200 activity logs)
        const logs = await db.query('SELECT user_id, action, details, timestamp FROM user_activity ORDER BY timestamp DESC LIMIT 200');

        // 2. Gather economy summary
        const usersCount = (await db.get('SELECT COUNT(*) as c FROM users')).c;
        const totalBalance = (await db.get('SELECT SUM(balance) as s FROM users')).s || 0;
        const topBalance = (await db.get('SELECT balance FROM users ORDER BY balance DESC LIMIT 1')).balance || 0;

        const logContext = logs.map(l => `[${l.timestamp}] User ${l.user_id}: ${l.action} (${l.details})`).join('\n');

        const prompt = `
            Ты — эксперт-аналитик игры "Taxi Simulator". Проанализируй данные за последний час и составь отчет для администратора.
            
            СОСТОЯНИЕ ЭКОНОМИКИ:
            - Всего игроков: ${usersCount}
            - Общий баланс всех игроков: ${totalBalance} PLN
            - Максимальный баланс у одного игрока: ${topBalance} PLN
            
            ПОСЛЕДНИЕ ЛОГИ АКТИВНОСТИ (выборка):
            ${logContext}
            
            ЗАДАЧА:
            1. Выяви подозрительных игроков (резкие скачки баланса, много действий за короткое время).
            2. Оцени здоровье экономики (нет ли признаков гиперинфляции или аномального накопления).
            3. Дай краткие рекомендации администратору.
            
            ФОРМАТ ОТВЕТА (кратко, в HTML разметке для Telegram):
            📊 <b>ОТЧЕТ АНАЛИТИКА (AI)</b>
            
            ⚠️ <b>Подозрения:</b>
            - [Список игроков и причин]
            
            📈 <b>Экономика:</b>
            - [Вывод о здоровье]
            
            💡 <b>Рекомендация:</b>
            - [Что сделать]
        `;

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const result = await model.generateContent(prompt);
        const reportText = result.response.text();

        // Update cache
        lastReport = reportText;
        lastPromptTime = Date.now();
        quotaExceededUntil = 0;

        return reportText;

    } catch (e) {
        console.error('AI Analysis Error:', e);

        // Handle 429 specifically
        if (e.status === 429 || (e.message && e.message.includes('429'))) {
            quotaExceededUntil = Date.now() + QUOTA_BACKOFF;
            return `⚠️ <b>Лимит API исчерпан (Quota 429).</b> Перехожу в режим ожидания на 30 минут.`;
        }

        return "⚠️ Ошибка при формировании AI отчета.";
    }
}

module.exports = { runAIAnalysis };
