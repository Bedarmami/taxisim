const { Telegraf, Markup } = require('telegraf');
const db = require('./db');
require('dotenv').config();
const aiSupport = require('./ai-support');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || 'DUMMY_TOKEN');

// Main Menu Keyboard
const mainKeyboard = Markup.keyboard([
    ['👨‍💻 Поддержка']
]).resize();

// Database helpers for support
async function saveSupportMessage(userId, message, fileId = null, isFromAdmin = 0, senderType = 'user') {
    try {
        await db.dbReady;
        // isFromAdmin is kept for compatibility with existing queries if needed, 
        // but sender_type is the new preferred way.
        await db.run(
            'INSERT INTO support_messages (user_id, message, file_id, is_from_admin, sender_type) VALUES (?, ?, ?, ?, ?)',
            [userId, message, fileId, isFromAdmin, senderType]
        );
    } catch (e) {
        console.error('Error saving support message:', e);
    }
}

// Commands
bot.start((ctx) => {
    ctx.reply('Привет! Это бот симулятора такси. Чтобы связаться с поддержкой, нажми кнопку ниже.', mainKeyboard);
});

// Handling user messages
bot.hears('👨‍💻 Поддержка', (ctx) => {
    ctx.reply('Опишите вашу проблему. Вы также можете прикрепить фото:');
});

bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return; // Ignore commands here
    if (ctx.message.text === '👨‍💻 Поддержка') return; // Handled by bot.hears

    const userId = ctx.from.id.toString();
    const text = ctx.message.text;

    // AI Support Interceptor
    try {
        const aiReply = await aiSupport.getAIResponse(userId, text);
        if (aiReply) {
            await ctx.reply(`🤖 ИИ-Помощник:\n\n${aiReply}`);
            // Log both the user message and the AI response
            await saveSupportMessage(userId, text, null, 0, 'user');
            await saveSupportMessage(userId, aiReply, null, 0, 'ai');
            return;
        }
    } catch (e) {
        console.error('AI Support Interceptor Error:', e);
    }

    await saveSupportMessage(userId, text, null, 0, 'user');
    await ctx.reply('Ожидайте, скоро вам ответит администратор.');
});

bot.on('photo', async (ctx) => {
    const userId = ctx.from.id.toString();
    const photo = ctx.message.photo;
    const fileId = photo[photo.length - 1].file_id; // Get the highest resolution
    const caption = ctx.message.caption || '';

    await saveSupportMessage(userId, caption, fileId);
    await ctx.reply('Ожидайте, скоро вам ответит администратор.');
});

// Notification API
const sendNotification = async (telegramId, type, data) => {
    if (!process.env.TELEGRAM_BOT_TOKEN) return false;

    try {
        let message = '';
        switch (type) {
            case 'BROADCAST':
                message = data.text;
                break;
            case 'AUCTION_BID':
                message = `⚠️ Вашу ставку на контейнер перебил игрок ${data.newBidder}!\nТекущая ставка: ${data.amount} PLN`;
                break;
            case 'AUCTION_WIN':
                message = `🎉 Поздравляем! Вы выиграли аукцион!\nВаш приз: ${data.rewardName}.\nЗаберите его в меню Аукциона!`;
                break;
            case 'SUPPORT_REPLY':
                message = `📨 Ответ от администрации:\n\n${data.text}`;
                break;
            case 'FLEET_REPORT':
                message = `📊 Отчет автопарка:\nВаши водители принесли прибыль: ${data.profit} PLN.`;
                break;
            case 'MAINTENANCE':
                message = data.active ? '🔧 В игре начались технические работы. Мы скоро вернемся!' : '✅ Технические работы завершены! Заходите в игру.';
                break;
            case 'DAILY_REMINDER':
                message = '🎁 Ваш ежедневный бонус уже доступен! Не забудьте забрать его.';
                break;
            default:
                message = data.text || 'Уведомление от системы.';
        }

        if (data.imageUrl) {
            await bot.telegram.sendPhoto(telegramId, data.imageUrl, {
                caption: message,
                parse_mode: 'HTML'
            });
        } else {
            await bot.telegram.sendMessage(telegramId, message, {
                parse_mode: 'HTML'
            });
        }

        // Log to support history
        const senderType = type === 'SUPPORT_REPLY' ? 'admin' : 'system';
        await saveSupportMessage(telegramId.toString(), message, null, (senderType === 'admin' ? 1 : 0), senderType);

        // Optional: Log successful notification for critical types
        if (type !== 'BROADCAST') {
            await db.run('INSERT INTO logs (level, message, timestamp) VALUES (?, ?, ?)',
                ['INFO', `Notification sent: ${type} to ${telegramId}`, new Date().toISOString()]);
        }

        return true;
    } catch (e) {
        console.error(`Failed to send ${type} notification to ${telegramId}:`, e.message);

        // Log failure to DB for Admin Panel visibility
        await db.run('INSERT INTO logs (level, message, timestamp, stack) VALUES (?, ?, ?, ?)',
            ['ERROR', `Failed to send ${type} to ${telegramId}: ${e.message}`, new Date().toISOString(), e.stack || '']);

        return false;
    }
};

// Start function
const initBot = () => {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
        console.warn('⚠️ TELEGRAM_BOT_TOKEN not found in .env. Bot functionality will be disabled.');
        return;
    }

    bot.launch()
        .then(async () => {
            console.log('🚀 Telegram Bot started successfully');
            await db.dbReady;
            await db.run('INSERT INTO logs (level, message, timestamp) VALUES (?, ?, ?)',
                ['INFO', 'Bot launched successfully', new Date().toISOString()]);
        })
        .catch(async (err) => {
            console.error('❌ Bot launch failed:', err);
            await db.dbReady;
            await db.run('INSERT INTO logs (level, message, timestamp, stack) VALUES (?, ?, ?, ?)',
                ['ERROR', `Bot launch failed: ${err.message}`, new Date().toISOString(), err.stack || '']);
        });

    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
};

module.exports = {
    initBot,
    sendNotification,
    bot
};
