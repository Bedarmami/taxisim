const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('./db');
require('dotenv').config();

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

/**
 * Runs a deep AI analysis on recent logs and economy state.
 */
async function runAIAnalysis() {
    if (!genAI) return "⚠️ Gemini API Key missing. AI Monitoring disabled.";

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
        return result.response.text();

    } catch (e) {
        console.error('AI Analysis Error:', e);
        return "⚠️ Ошибка при формировании AI отчета.";
    }
}

module.exports = { runAIAnalysis };
