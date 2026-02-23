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
 * Simple keyword-based diagnostics that work without AI.
 */
function getHeuristicResponse(user, userMessage) {
    const msg = userMessage.toLowerCase();

    // 1. Fuel check
    if ((msg.includes('заказ') || msg.includes('ехать') || msg.includes('работ')) && (user.fuel < 1 && user.gas_fuel < 1)) {
        return "Похоже, у вас закончилось топливо (бензин и газ по 0л). Чтобы брать новые заказы, вам нужно заправиться на вкладке «Заправка». Если нет денег — можно взять небольшое достижение или ежедневный бонус.";
    }

    // 2. Stamina check
    if ((msg.includes('заказ') || msg.includes('ехать') || msg.includes('энерг') || msg.includes('устал')) && user.stamina < 5) {
        return "Ваш персонаж слишком устал (энергия почти на нуле). Вы не сможете брать заказы, пока не отдохнете. Энергия восстанавливается сама со временем, или можно купить кофе в меню навыков/магазина.";
    }

    // 3. Balance check for fuel/rent
    if ((msg.includes('кофе') || msg.includes('заправ')) && user.balance < 10) {
        return "У вас недостаточно средств на балансе. Попробуйте забрать ежедневный бонус или проверить раздел достижений, чтобы получить стартовый капитал.";
    }

    // 4. Ban check
    if (user.is_banned) {
        return "Ваш аккаунт заблокирован администратором. Пожалуйста, ожидайте ответа поддержки для выяснения причин.";
    }

    // 5. New: Selling Car
    if (msg.includes('продать') && (msg.includes('машин') || msg.includes('авто'))) {
        return "Продать свою машину можно в разделе «Гараж» или «Мои авто». Обычно выкупная цена составляет около 60-70% от первоначальной стоимости. Арендованные авто (Skoda Fabia Rent) продать нельзя.";
    }

    // 6. New: Upgrades/Skills
    if (msg.includes('улучш') || msg.includes('прокач') || msg.includes('навык')) {
        return "Улучшить характеристики персонажа можно в меню «Навыки». Там можно прокачать Харизму (чаевые), Механика (дешевле ремонт) и Навигатора (быстрее заказы).";
    }

    // 7. New: Jackpot
    if (msg.includes('джекпот') || msg.includes('выиграть')) {
        return "Джекпот накапливается из каждой поездки всех игроков. Шанс выиграть его есть в каждой поездке или в казино. Текущий размер джекпота виден в главном меню.";
    }

    return null;
}

/**
 * Tries to get an AI-generated answer for the support request.
 */
async function getAIResponse(telegramId, userMessage) {
    let user;
    try {
        user = await db.get('SELECT * FROM users WHERE telegram_id = ?', [telegramId]);
    } catch (e) {
        console.error('DB Error in AI Support:', e);
    }

    if (user) {
        // Try heuristic first (FAST & FREE)
        const quickAnswer = getHeuristicResponse(user, userMessage);
        if (quickAnswer) return quickAnswer;
    }

    if (!genAI) {
        console.warn('⚠️ GEMINI_API_KEY not found. AI Support disabled.');
        return null;
    }

    const playerContext = await getPlayerContext(telegramId);
    const prompt = `
Ты — интеллектуальный помощник поддержки игры "Taxi Simulator Pro" (Telegram бот). 
Твоя задача: помогать игрокам решать технические и игровые проблемы на основе их текущего статуса.

ДАННЫЕ ИГРОКА:
${playerContext}

ВОПРОС ИГРОКА:
"${userMessage}"

ИНСТРУКЦИИ:
1. Если вопрос касается механик игры, используй ДАННЫЕ ИГРОКА для ответа.
2. Отвечай вежливо, дружелюбно, на русском языке.
3. Если вопрос сложный или ты не можешь помочь, ответь ровно одним словом: SKIP.
4. Будь краток.

ОТВЕТ:`;

    const modelsToTry = ["gemini-1.5-flash-latest", "gemini-1.5-flash", "gemini-pro", "gemini-1.0-pro"];

    for (const modelName of modelsToTry) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const responseText = result.response.text().trim();

            if (responseText.toUpperCase() === 'SKIP') return null;
            return responseText;
        } catch (e) {
            console.error(`Gemini Error (model: ${modelName}):`, e.message);
            // If it's the last model, we fail
            if (modelName === modelsToTry[modelsToTry.length - 1]) {
                // Log final failure to DB for admin
                await db.run('INSERT INTO logs (level, message, timestamp, stack) VALUES (?, ?, ?, ?)',
                    ['ERROR', `AI Support Failed for ${telegramId}: ${e.message}`, new Date().toISOString(), e.stack || '']);
            }
        }
    }

    return null;
}

module.exports = {
    getAIResponse,
    getPlayerContext
};
