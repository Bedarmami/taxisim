const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('./db');
require('dotenv').config();

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

/**
 * Generates a diagnostic snippet about the player's current state.
 */
async function getPlayerContext(telegramId) {
    try {
        const user = await db.get('SELECT * FROM users WHERE telegram_id = ?', [telegramId]);
        if (!user) return "Игрок не найден в базе данных.";

        // Basic stats
        let context = `Статус игрока (ID: ${telegramId}):
- Баланс: ${user.balance} PLN
- Уровень: ${user.level} (Опыт: ${user.experience})
- Топливо: ${user.fuel} л.
- Газ: ${user.gas_fuel} л.
- Энергия (стамина): ${user.stamina}/100
- Всего поездок: ${user.rides_total}
- Текущая машина: ${user.car_id || 'Нет'}
- Состояние машины: ${user.cleanliness || 100}% чистота, ${user.tire_condition || 100}% шины
- Бан: ${user.is_banned ? 'ДА' : 'НЕТ'}
`;

        // Car details if available
        if (user.car_data) {
            const car = JSON.parse(user.car_data);
            context += `- Детали авто: ${car.name}, расход ${car.fuel_consumption}л/100км, бак ${car.tank_capacity}л\n`;
        }

        return context;
    } catch (e) {
        console.error('Error fetching player context:', e);
        return "Ошибка при получении данных игрока.";
    }
}

/**
 * Tries to get an AI-generated answer for the support request.
 * Returns null if AI thinks it's not a technical/gameplay issue it can solve.
 */
async function getAIResponse(telegramId, userMessage) {
    if (!genAI) {
        console.warn('⚠️ GEMINI_API_KEY not found. AI Support disabled.');
        return null;
    }

    async function tryGenerate(modelName) {
        const model = genAI.getGenerativeModel({ model: modelName });
        const playerContext = await getPlayerContext(telegramId);

        const prompt = `
Ты — интеллектуальный помощник поддержки игры "Taxi Simulator Pro" (Telegram бот). 
Твоя задача: помогать игрокам решать технические и игровые проблемы на основе их текущего статуса.

ДАННЫЕ ИГРОКА:
${playerContext}

ВОПРОС ИГРОКА:
"${userMessage}"

ИНСТРУКЦИИ:
1. Если вопрос касается механик игры (почему нет кнопки заказа, как заработать, почему мало топлива и т.д.), используй ДАННЫЕ ИГРОКА для ответа.
   - Пример: если топлива < 1, а игрок спрашивает "почему не могу ехать", ответь, что нужно заправиться.
   - Пример: если стамина 0, скажи, что нужно отдохнуть или выпить кофе.
2. Отвечай вежливо, дружелюбно, на русском языке.
3. Если вопрос не касается игры или ты не можешь помочь на основе данных (например, "верните деньги за донат", "почему я забанен" - в сложных случаях), ответь ровно одним словом: SKIP.
4. Если ты даешь совет, он должен быть коротким и понятным.

ОТВЕТ:`;

        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    }

    try {
        let responseText;
        try {
            // Priority 1: Gemini 1.5 Flash (Modern & Free)
            responseText = await tryGenerate("gemini-1.5-flash");
        } catch (flashError) {
            console.warn(`Gemini 1.5 Flash failed (${flashError.message}), trying fallback to gemini-pro...`);
            // Priority 2: Gemini Pro (Standard fallback)
            responseText = await tryGenerate("gemini-pro");
        }

        if (responseText.toUpperCase() === 'SKIP') {
            return null;
        }

        return responseText;
    } catch (e) {
        console.error('Gemini AI All Models Error:', e.message);
        return null;
    }
}

module.exports = {
    getAIResponse,
    getPlayerContext
};
