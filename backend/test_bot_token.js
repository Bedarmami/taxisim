const { Telegraf } = require('telegraf');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
console.log('Token starts with:', token ? token.substring(0, 5) + '...' : 'MISSING');

if (!token || token === 'DUMMY_TOKEN') {
    console.error('❌ TELEGRAM_BOT_TOKEN is missing or dummy.');
    process.exit(1);
}

const bot = new Telegraf(token);

bot.telegram.getMe()
    .then((me) => {
        console.log('✅ Bot is valid!');
        console.log('Bot Username:', me.username);
        console.log('Bot ID:', me.id);
        process.exit(0);
    })
    .catch((err) => {
        console.error('❌ Bot token validation failed:', err.message);
        process.exit(1);
    });
