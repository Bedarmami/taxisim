const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const compression = require('compression');
const db = require('./db'); // Import configured SQLite DB
const path = require('path');
const https = require('https');
require('dotenv').config();

const { router: auctionRouter, initAuction, startAuction } = require('./routes/auction');
const { initBot, sendNotification, bot } = require('./bot');

const app = express();
const PORT = process.env.PORT || 3000;
const plates = require('./plates');

// Middleware
app.use(cors());
app.use(compression()); // Gzip all responses
app.use(bodyParser.json());

// Serve frontend with caching headers for static assets
app.use(express.static(path.join(__dirname, '..', 'frontend'), {
    maxAge: '1h',
    etag: true,
    lastModified: true
}));

// v2.5: Maintenance Mode and Logging
let MAINTENANCE_MODE = false;
let JACKPOT_POOL = 0;
let COMMUNITY_DISTANCE_GOAL = 50000; // 50,000 km community goal

// v3.0: Container Auction State
let AUCTION_CONFIG = {
    startingBid: 5000,
    duration: 5 * 60 * 1000, // 5 minutes
    interval: 10 * 60 * 1000, // 10 minutes total cycle
    manualReward: null // carId or null for random
};

let AUCTION_STATE = {
    active: false,
    startTime: 0,
    endTime: 0,
    currentBid: 0,
    highestBidder: null, // {telegramId, name}
    reward: null, // {type: 'car', id: 'fabia_gas'}
    history: [] // Last 5 winners
};

// v3.1: Order Tracking Cache (60 min TTL)
const ORDERS_CACHE = new Map();
const ORDER_CACHE_TTL = 60 * 60 * 1000;

function cleanupOrdersCache() {
    const now = Date.now();
    for (const [tid, data] of ORDERS_CACHE.entries()) {
        if (now - data.timestamp > ORDER_CACHE_TTL) {
            ORDERS_CACHE.delete(tid);
        }
    }
}
setInterval(cleanupOrdersCache, 5 * 60 * 1000); // Clean every 5 mins

// Load jackpot from DB on start
async function loadJackpot() {
    try {
        const row = await db.get('SELECT value FROM global_settings WHERE key = ?', ['jackpot_pool']);
        if (row) JACKPOT_POOL = parseFloat(row.value) || 0;
        console.log(`🎰 Jackpot pool loaded: ${JACKPOT_POOL} PLN`);
    } catch (e) {
        console.error('Error loading jackpot:', e);
    }
}
async function saveJackpot() {
    try {
        await db.run('INSERT OR REPLACE INTO global_settings (key, value) VALUES (?, ?)', ['jackpot_pool', JACKPOT_POOL.toString()]);
    } catch (e) { console.error('Save jackpot error:', e); }
}

// Initialize maintenance mode from DB
const initMaintenanceMode = async () => {
    try {
        const setting = await db.get('SELECT value FROM global_settings WHERE key = "maintenance_mode"');
        MAINTENANCE_MODE = setting?.value === 'true';
        console.log(`🔧 Maintenance mode: ${MAINTENANCE_MODE}`);
    } catch (e) {
        console.error('Error loading maintenance mode:', e);
        MAINTENANCE_MODE = false;
    }
};

// Initialize server logic after DB is ready
const logError = async (level, message, stack = '') => {
    try {
        await db.run('INSERT INTO logs (level, message, timestamp, stack) VALUES (?, ?, ?, ?)',
            [level, message, new Date().toISOString(), stack]);
    } catch (e) { console.error('Logging error:', e); }
};

const logActivity = async (telegramId, action, details = {}) => {
    try {
        await db.run('INSERT INTO user_activity (user_id, action, details, timestamp) VALUES (?, ?, ?, ?)',
            [telegramId, action, JSON.stringify(details), new Date().toISOString()]);
    } catch (e) {
        console.error('Activity logging error:', e);
    }
};

// v3.4: Social Pulse Activity Log
let SOCIAL_ACTIVITY_LOG = [];
const logSocialActivity = (message) => {
    SOCIAL_ACTIVITY_LOG.unshift({ message, timestamp: new Date().toISOString() });
    if (SOCIAL_ACTIVITY_LOG.length > 20) SOCIAL_ACTIVITY_LOG.pop();
};

db.dbReady.then(async () => {
    console.log('✅ Database is ready. Running startup tasks...');

    // Immediate startup log
    await logError('INFO', 'Server startup: Database ready, initializing systems...', '');

    await loadJackpot();
    await initMaintenanceMode();
    await syncCarsFromDB();

    // v3.2: Initialize Telegram Bot
    initBot();

    // v3.0: Initialize auction system
    initAuction(AUCTION_CONFIG, AUCTION_STATE, CARS, db, getUser, saveUser, adminAuth, logActivity);

    // Start the first auction if nothing is active
    if (!AUCTION_STATE.active) {
        startAuction();
    }
});

// Middleware to check maintenance mode
app.use((req, res, next) => {
    if (MAINTENANCE_MODE && req.path.startsWith('/api/') && !req.path.startsWith('/api/admin')) {
        return res.status(503).json({
            error: 'Maintenance',
            message: 'Идут технические работы. Попробуйте позже.'
        });
    }
    next();
});

// v3.0: Register auction routes
app.use('/api/auction', auctionRouter);
app.use('/api/admin/containers', auctionRouter);

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

// Root route to serve the main app
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ============= v2.6: AGGREGATORS =============
const AGGREGATORS = {
    yodex: { id: 'yodex', name: '🚖 Yodex', baseMultiplier: 1.0, commission: 0.20, description: 'Эконом', color: '#f3a000' },
    ubar: { id: 'ubar', name: '🖤 Ubar', baseMultiplier: 1.3, commission: 0.25, description: 'Комфорт', color: '#1a1a1a' },
    volt: { id: 'volt', name: '⚡ Volt', baseMultiplier: 1.6, commission: 0.30, description: 'Премиум', color: '#2ecc71' }
};

const PASSENGERS = [
    { name: "Marek", avatar: "👨‍💻" },
    { name: "Zuzanna", avatar: "👩‍💼" },
    { name: "Antoni", avatar: "👴" },
    { name: "Lena", avatar: "👩‍🎓" },
    { name: "Piotr", avatar: "🧔" },
    { name: "Amelia", avatar: "👩‍🎤" },
    { name: "Jan", avatar: "👨‍🌾" },
    { name: "Maria", avatar: "👵" },
    { name: "Kacper", avatar: "👦" },
    { name: "Oliwia", avatar: "👧" }
];

// ============= ОПРЕДЕЛЕНИЕ ВСЕХ МАШИН =============
let CARS = {};

async function syncCarsFromDB() {
    try {
        const rows = await db.query('SELECT * FROM car_definitions');
        const newCars = {};

        // Add defaults first
        const defaults = {
            fabia_blue_rent: {
                id: 'fabia_blue_rent',
                name: '🚙 Skoda Fabia (Аренда)',
                image: '🚙',
                fuel_consumption: 7.2,
                tank_capacity: 45,
                gas_tank_capacity: 0,
                purchase_price: 0,
                rent_price: 300,
                has_gas: false,
                is_owned: false,
                description: 'Надёжный автомобиль для начала работы',
                type: 'petrol',
                condition: 100
            }
        };
        Object.assign(newCars, defaults);

        rows.forEach(row => {
            newCars[row.id] = {
                id: row.id,
                name: row.name,
                image: row.image,
                fuel_consumption: row.fuel_consumption || 7.0,
                tank_capacity: row.tank_capacity || 45,
                gas_tank_capacity: row.gas_tank_capacity || 0,
                purchase_price: row.purchase_price || 0,
                rent_price: row.rent_price || 0,
                has_gas: !!row.has_gas,
                gas_consumption: row.gas_consumption || 0,
                is_owned: row.purchase_price > 0,
                description: row.description || '',
                type: row.has_gas ? 'dual' : 'petrol',
                condition: 100,
                is_premium: !!row.is_premium
            };
        });

        // Mutate existing CARS object instead of re-assigning to keep references in other modules (like auction.js)
        Object.keys(CARS).forEach(key => delete CARS[key]);
        Object.assign(CARS, newCars);

        console.log(`🚗 Loaded ${Object.keys(CARS).length} car definitions from DB`);
    } catch (e) {
        console.error('Error syncing cars:', e);
    }
}

// v2.3: Buy Coffee (restore stamina)
app.post('/api/user/:telegramId/buy-coffee', async (req, res) => {
    try {
        const user = await getUser(req.params.telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const cost = 100;
        if (user.balance < cost) {
            return res.status(400).json({ error: 'Недостаточно средств' });
        }

        user.balance -= cost;
        user.stamina = Math.min(100, user.stamina + 50);

        await saveUser(user);

        res.json({
            success: true,
            balance: user.balance,
            stamina: user.stamina,
            message: '☕ Кофе выпит! +50 энергии'
        });
    } catch (error) {
        console.error('Error buying coffee:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// v2.3: Get current global event
app.get('/api/current-event', (req, res) => {
    if (currentEvent) {
        const timeLeft = currentEvent.endTime - Date.now();
        res.json({
            active: true,
            event: {
                ...currentEvent,
                timeLeft
            }
        });
    } else {
        res.json({ active: false });
    }
});

// v2.3: Claim login streak reward
app.post('/api/user/:telegramId/claim-streak', async (req, res) => {
    try {
        const user = await getUser(req.params.telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const streak = user.login_streak || 1;
        let reward = { money: 0, fuel: 0, message: '' };

        switch (streak) {
            case 1:
                reward = { money: 100, fuel: 0, message: '🎁 День 1: +100 PLN' };
                break;
            case 2:
                reward = { money: 200, fuel: 0, message: '🎁 День 2: +200 PLN' };
                break;
            case 3:
                reward = { money: 300, fuel: 20, message: '🎁 День 3: +300 PLN + 20 топлива' };
                break;
            case 5:
                reward = { money: 500, fuel: 0, coffee: true, message: '🎁 День 5: +500 PLN + Кофе' };
                user.stamina = Math.min(100, user.stamina + 50);
                break;
            case 7:
                reward = { money: 1000, fuel: 0, message: '🎁 День 7: +1000 PLN!' };
                break;
            default:
                reward = { money: streak * 50, fuel: 0, message: `🎁 День ${streak}: +${streak * 50} PLN` };
        }

        user.balance += reward.money;
        user.fuel = Math.min(user.max_fuel || 45, user.fuel + reward.fuel);

        await saveUser(user);

        res.json({
            success: true,
            streak,
            reward,
            balance: user.balance,
            fuel: user.fuel,
            stamina: user.stamina
        });
    } catch (error) {
        console.error('Error claiming streak:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============= ПАРТНЁРЫ =============
const PARTNERS = [
    {
        id: 1,
        name: '👤 Начинающий',
        description: 'Делим 50/50, их машина, их топливо',
        revenue_split: 0.5,
        provides_car: true,
        fuel_provided: false,
        weekly_cost: 0,
        requirements: { rides: 0 }
    },
    {
        id: 2,
        name: '🤝 Автономный',
        description: 'Делим 60/40, своя машина, своё топливо',
        revenue_split: 0.4,
        provides_car: false,
        fuel_provided: false,
        weekly_cost: 170,
        requirements: { rides: 200 }
    },
    {
        id: 3,
        name: '👔 Бизнес-партнёр',
        description: 'Делим 70/30, +20% к заказам',
        revenue_split: 0.3,
        provides_car: false,
        fuel_provided: false,
        weekly_cost: 350,
        bonus_orders: 1.2,
        requirements: { rides: 450 }
    },
    {
        id: 4,
        name: '💼 Инвестор',
        description: 'Делим 80/20, платит за топливо',
        revenue_split: 0.2,
        provides_car: false,
        fuel_provided: true,
        weekly_cost: 600,
        bonus_orders: 1.3,
        requirements: { rides: 700 }
    },
    {
        id: 5,
        name: '👑 VIP партнёр',
        description: 'Делим 90/10, лучшие заказы',
        revenue_split: 0.1,
        provides_car: false,
        fuel_provided: true,
        weekly_cost: 1200,
        bonus_orders: 1.5,
        vip_orders: true,
        requirements: { rides: 1000 }
    }
];

// ============= v2.2: CITY DISTRICTS =============
const DISTRICTS = {
    suburbs: {
        id: 'suburbs',
        name: '🏘️ Пригород',
        description: 'Спокойные длинные поездки',
        unlocked: true,
        distance: { min: 10, max: 20 },
        priceMultiplier: 1.0,
        trafficChance: 0.05,
        vipChance: 0.05
    },
    center: {
        id: 'center',
        name: '🏙️ Центр',
        description: 'Короткие поездки, пробки, высокая оплата',
        unlockLevel: 5,
        distance: { min: 2, max: 5 },
        priceMultiplier: 1.5,
        trafficChance: 0.3,
        vipChance: 0.1
    },
    airport: {
        id: 'airport',
        name: '✈️ Аэропорт',
        description: 'VIP клиенты, большие чаевые',
        unlockLevel: 10,
        unlockCost: 5000,
        distance: { min: 5, max: 10 },
        priceMultiplier: 2.0,
        trafficChance: 0.1,
        vipChance: 0.4
    },
    industrial: {
        id: 'industrial',
        name: '🏭 Промзона',
        description: 'Тяжелые грузы, суровые клиенты',
        unlockLevel: 3,
        distance: { min: 8, max: 15 },
        priceMultiplier: 1.3,
        trafficChance: 0.2,
        vipChance: 0.02
    },
    night: {
        id: 'night',
        name: '🌃 Ночной город',
        description: 'Вечеринки, драйв и ночные тарифы',
        unlockLevel: 7,
        distance: { min: 3, max: 8 },
        priceMultiplier: 1.8,
        trafficChance: 0.05,
        vipChance: 0.25
    }
};

function isDistrictUnlocked(district, user) {
    if (district.unlocked) return true;
    if (district.unlockLevel && user.level < district.unlockLevel) return false;
    if (district.unlockCost && user.balance < district.unlockCost) return false;
    return true;
}


// ============= v2.3: GLOBAL EVENTS =============
let currentEvent = null;

const GLOBAL_EVENTS = {
    rain: {
        id: 'rain',
        name: '🌧️ Дождь',
        description: 'Больше заказов, выше оплата',
        duration: 30 * 60 * 1000, // 30 minutes
        orderMultiplier: 1.3,
        payMultiplier: 1.2,
        icon: '🌧️'
    },
    rush_hour: {
        id: 'rush_hour',
        name: '⏰ Час пик',
        description: 'Много заказов, высокие цены',
        duration: 60 * 60 * 1000, // 1 hour
        orderMultiplier: 1.5,
        payMultiplier: 1.25,
        icon: '⏰'
    },
    happy_hour: {
        id: 'happy_hour',
        name: '🎉 Счастливый час',
        description: 'Двойной заработок!',
        duration: 60 * 60 * 1000, // 1 hour
        orderMultiplier: 1.0,
        payMultiplier: 2.0,
        icon: '🎉'
    }
};

function startRandomEvent() {
    if (currentEvent) return; // Event already active

    const eventKeys = Object.keys(GLOBAL_EVENTS);
    const randomEvent = GLOBAL_EVENTS[eventKeys[Math.floor(Math.random() * eventKeys.length)]];

    currentEvent = {
        ...randomEvent,
        startTime: Date.now(),
        endTime: Date.now() + randomEvent.duration
    };

    console.log(`🎁 Event started: ${currentEvent.name}`);

    setTimeout(() => {
        console.log(`Event ended: ${currentEvent.name}`);
        currentEvent = null;
    }, randomEvent.duration);
}

// Check for rush hour events
function checkRushHour() {
    const hour = new Date().getHours();
    const isRushHour = (hour >= 7 && hour < 9) || (hour >= 17 && hour < 19);

    if (isRushHour && (!currentEvent || currentEvent.id !== 'rush_hour')) {
        currentEvent = {
            ...GLOBAL_EVENTS.rush_hour,
            startTime: Date.now(),
            endTime: Date.now() + GLOBAL_EVENTS.rush_hour.duration
        };
        console.log('⏰ Rush hour started!');
    }
}

// Start random events every 2-4 hours
setInterval(() => {
    if (Math.random() < 0.3) { // 30% chance
        startRandomEvent();
    }
}, 2 * 60 * 60 * 1000); // Check every 2 hours

// Check rush hour every hour
setInterval(checkRushHour, 60 * 60 * 1000);
checkRushHour(); // Check on startup

// ============= v2.4: LOOTBOX SYSTEM =============
const LOOTBOX_TYPES = {
    wooden: {
        id: 'wooden',
        name: '🟤 Деревянный сундук',
        rarity: 'common',
        rewards: [
            { type: 'money', min: 50, max: 100, chance: 0.7 },
            { type: 'fuel', min: 10, max: 20, chance: 0.2 },
            { type: 'stamina', amount: 20, chance: 0.1 }
        ]
    },
    silver: {
        id: 'silver',
        name: '🔵 Серебряный сундук',
        rarity: 'rare',
        rewards: [
            { type: 'money', min: 200, max: 500, chance: 0.5 },
            { type: 'fuel', min: 30, max: 50, chance: 0.25 },
            { type: 'stamina', amount: 50, chance: 0.15 },
            { type: 'car', chance: 0.1 }
        ]
    },
    gold: {
        id: 'gold',
        name: '🟣 Золотой сундук',
        rarity: 'epic',
        rewards: [
            { type: 'money', min: 500, max: 1000, chance: 0.4 },
            { type: 'car', chance: 0.3 },
            { type: 'stamina', amount: 100, chance: 0.2 },
            { type: 'upgrade', chance: 0.1 }
        ]
    },
    legendary: {
        id: 'legendary',
        name: '💎 Легендарный сундук',
        rarity: 'legendary',
        rewards: [
            { type: 'money', min: 1000, max: 3000, chance: 0.4 },
            { type: 'exclusive_car', chance: 0.4 },
            { type: 'all_upgrades', chance: 0.2 },
            { type: 'free_plate_roll', chance: 0.05 } // Added free_plate_roll as a possible reward
        ]
    }
};

function openLootbox(lootboxType) {
    const box = LOOTBOX_TYPES[lootboxType];
    if (!box) return null;

    const roll = Math.random();
    let cumulative = 0;

    for (const reward of box.rewards) {
        cumulative += reward.chance;
        if (roll <= cumulative) {
            let result = { type: reward.type, rarity: box.rarity };

            switch (reward.type) {
                case 'money':
                    result.amount = Math.floor(Math.random() * (reward.max - reward.min + 1)) + reward.min;
                    result.message = `💰 ${result.amount} PLN`;
                    break;
                case 'fuel':
                    result.amount = Math.floor(Math.random() * (reward.max - reward.min + 1)) + reward.min;
                    result.message = `⛽ ${result.amount} литров топлива`;
                    break;
                case 'stamina':
                    result.amount = reward.amount;
                    result.message = `⚡ ${result.amount} энергии`;
                    break;
                case 'car':
                    const cars = ['fabia_gas', 'prius_20', 'prius_30', 'corolla_sedan', 'camry'];
                    result.carId = cars[Math.floor(Math.random() * cars.length)];
                    result.message = `🚗 Новая машина: ${CARS[result.carId]?.name || result.carId}!`;
                    break;
                case 'exclusive_car':
                    result.carId = 'camry'; // Highest tier common car as placeholder or use a specific one if added
                    result.message = `🏎️ Вы выиграли Toyota Camry!`;
                    break;
                case 'upgrade':
                    result.upgrade = 'engine';
                    result.message = `⚙️ Улучшение двигателя!`;
                    break;
                case 'all_upgrades':
                    result.message = `🔧 Все улучшения!`;
                    break;
            }

            return result;
        }
    }

    return null;
}

function checkLootboxMilestones(user) {
    const lootboxes = user.lootboxes || { wooden: 0, silver: 0, gold: 0, legendary: 0 };
    const newBoxes = [];

    // Wooden: every 10 rides
    const woodenDue = Math.floor(user.rides_completed / 10);
    const woodenGiven = user.lootboxes_given?.wooden || 0;
    if (woodenDue > woodenGiven) {
        const toGive = woodenDue - woodenGiven;
        lootboxes.wooden = (lootboxes.wooden || 0) + toGive;
        newBoxes.push({ type: 'wooden', count: toGive });
        user.lootboxes_given = user.lootboxes_given || {};
        user.lootboxes_given.wooden = woodenDue;
    }

    // Silver: every 50 rides
    const silverDue = Math.floor(user.rides_completed / 50);
    const silverGiven = user.lootboxes_given?.silver || 0;
    if (silverDue > silverGiven) {
        const toGive = silverDue - silverGiven;
        lootboxes.silver = (lootboxes.silver || 0) + toGive;
        newBoxes.push({ type: 'silver', count: toGive });
        user.lootboxes_given = user.lootboxes_given || {};
        user.lootboxes_given.silver = silverDue;
    }

    // Gold: every 100 rides
    const goldDue = Math.floor(user.rides_completed / 100);
    const goldGiven = user.lootboxes_given?.gold || 0;
    if (goldDue > goldGiven) {
        const toGive = goldDue - goldGiven;
        lootboxes.gold = (lootboxes.gold || 0) + toGive;
        newBoxes.push({ type: 'gold', count: toGive });
        user.lootboxes_given = user.lootboxes_given || {};
        user.lootboxes_given.gold = goldDue;
    }

    // Legendary: login streak 7+
    if (user.login_streak >= 7) {
        const legendaryGiven = user.lootboxes_given?.legendary || 0;
        const legendaryDue = Math.floor(user.login_streak / 7);
        if (legendaryDue > legendaryGiven) {
            lootboxes.legendary = (lootboxes.legendary || 0) + 1;
            newBoxes.push({ type: 'legendary', count: 1 });
            user.lootboxes_given = user.lootboxes_given || {};
            user.lootboxes_given.legendary = legendaryDue;
        }
    }

    user.lootboxes = lootboxes;
    return newBoxes;
}

// ============= v2.4: CASINO GAMES =============
const SLOT_SYMBOLS = ['🍒', '🍋', '🍊', '💎', '7️⃣', '⭐'];

function spinSlots(bet) {
    const reel1 = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
    const reel2 = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
    const reel3 = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];

    let multiplier = 0;
    let message = '';

    // Check for wins
    if (reel1 === reel2 && reel2 === reel3) {
        // Three of a kind
        switch (reel1) {
            case '💎':
                multiplier = 10;
                message = '💎💎💎 ДЖЕКПОТ!';
                break;
            case '7️⃣':
                multiplier = 5;
                message = '7️⃣7️⃣7️⃣ Тройная семёрка!';
                break;
            case '⭐':
                multiplier = 3;
                message = '⭐⭐⭐ Звёздный выигрыш!';
                break;
            default:
                multiplier = 2;
                message = `${reel1}${reel1}${reel1} Тройка!`;
        }
    } else if (reel1 === reel2 || reel2 === reel3 || reel1 === reel3) {
        // Two of a kind
        multiplier = 1;
        message = 'Возврат ставки';
    } else {
        message = 'Не повезло...';
    }

    return {
        reels: [reel1, reel2, reel3],
        multiplier,
        winAmount: bet * multiplier,
        message
    };
}

function spinRoulette(bet) {
    const multipliers = [
        { value: 0, chance: 0.13 },
        { value: 0.5, chance: 0.20 },
        { value: 1, chance: 0.30 },
        { value: 2, chance: 0.20 },
        { value: 3, chance: 0.10 },
        { value: 5, chance: 0.05 },
        { value: 10, chance: 0.02 }
    ];

    const roll = Math.random();
    let cumulative = 0;
    let selectedMultiplier = 0;

    for (const mult of multipliers) {
        cumulative += mult.chance;
        if (roll <= cumulative) {
            selectedMultiplier = mult.value;
            break;
        }
    }

    const winAmount = Math.floor(bet * selectedMultiplier);
    let message = '';

    if (selectedMultiplier === 10) {
        message = '🎉 x10! МЕГА ВЫИГРЫШ!';
    } else if (selectedMultiplier >= 5) {
        message = '🎊 x5! Отличный результат!';
    } else if (selectedMultiplier >= 2) {
        message = `✨ x${selectedMultiplier}! Неплохо!`;
    } else if (selectedMultiplier === 1) {
        message = 'Возврат ставки';
    } else if (selectedMultiplier === 0.5) {
        message = 'Половина ставки';
    } else {
        message = '😢 Ничего не выиграли';
    }

    return {
        multiplier: selectedMultiplier,
        winAmount,
        message
    };
}

function resetCasinoSpins(user) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const lastReset = user.casino_last_reset ? user.casino_last_reset.split('T')[0] : null;

    if (lastReset !== today) {
        user.casino_spins_today = 0;
        user.casino_last_reset = now.toISOString();
    }
}

// ============= ДОСТИЖЕНИЯ =============
const ACHIEVEMENTS = {
    first_ride: { id: 'first_ride', name: '👶 Первый заказ', desc: 'Выполнить первый заказ', reward: 50, icon: '🎉' },
    fuel_saver: { id: 'fuel_saver', name: '⛽ Экономист', desc: 'Потратить на топливо менее 100 PLN за день', reward: 100, icon: '💰' },
    rich_taxi: { id: 'rich_taxi', name: '💎 Миллионер', desc: 'Заработать 10000 PLN', reward: 500, icon: '👑' },
    marathon: { id: 'marathon', name: '🏃 Марафонец', desc: 'Выполнить 10 заказов подряд', reward: 200, icon: '🏆' },
    night_rider: { id: 'night_rider', name: '🌙 Ночной гонщик', desc: 'Выполнить 5 ночных заказов', reward: 150, icon: '🌃' },
    first_car: { id: 'first_car', name: '🚗 Первая машина', desc: 'Купить свою первую машину', reward: 100, icon: '🚙' },
    gas_install: { id: 'gas_install', name: '🔵 Газовщик', desc: 'Найти машину с ГБО', reward: 150, icon: '⛽' }
};

// ============= СОБЫТИЯ =============
const EVENTS = [
    { type: 'bonus', message: '💰 Щедрые чаевые! +15 PLN', effect: (user) => user.balance += 15, icon: '💵' },
    { type: 'bonus', message: '🍀 Нашли мелочь в машине +5 PLN', effect: (user) => user.balance += 5, icon: '🪙' },
    { type: 'bonus', message: '🤵 Постоянный клиент +25 PLN', effect: (user) => user.balance += 25, icon: '🤝' },
    { type: 'penalty', message: '👮 Штраф за парковку -20 PLN', effect: (user) => user.balance = Math.max(0, user.balance - 20), icon: '🚔' }
];

// ============= ЛОКАЦИИ =============
const LOCATIONS = [
    { name: "Рыночная площадь", type: "center", district: "center", base_price: 1.0 },
    { name: "Железнодорожный вокзал", type: "station", district: "center", base_price: 1.2 },
    { name: "Университет", type: "education", district: "center", base_price: 0.9 },
    { name: "Торговый центр", type: "shopping", district: "center", base_price: 1.1 },
    { name: "Аэропорт", type: "airport", district: "airport", base_price: 1.8 },
    { name: "Старый город", type: "tourist", district: "suburbs", base_price: 1.3 },
    { name: "Парк культуры", type: "park", district: "suburbs", base_price: 0.8 },
    { name: "Городская больница", type: "hospital", district: "suburbs", base_price: 1.0 },
    { name: "Промзона", type: "industrial", district: "industrial", base_price: 1.4 },
    { name: "Заводской склад", type: "industrial", district: "industrial", base_price: 1.2 },
    { name: "Ночной клуб", type: "night", district: "night", base_price: 1.5 },
    { name: "Казино 'Удача'", type: "night", district: "night", base_price: 1.6 },
    { name: "Бизнес центр", type: "office", district: "center", base_price: 1.3 }
];

// ============= ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =============

function checkAchievements(user, context = {}) {
    const completed = [];
    const achievements = user.achievements || {};

    // Safety check: ensure user.achievements is an object
    if (typeof achievements !== 'object' || achievements === null || Array.isArray(achievements)) {
        console.warn(`[Achievements] User ${user.telegram_id} had invalid achievements type: ${typeof achievements}. Resetting to {}.`);
        user.achievements = {};
    }

    // BUGFIX: Check .completed flag explicitly to avoid re-granting
    if (!user.achievements.first_ride?.completed && user.rides_total >= 1) {
        console.log(`[Achievements] Granting first_ride to ${user.telegram_id}`);
        user.achievements.first_ride = { completed: true, date: new Date().toISOString() };
        completed.push({ ...ACHIEVEMENTS.first_ride, reward: 50 });
        user.balance += 50;
    }

    if (!user.achievements.marathon?.completed && user.rides_streak >= 10) {
        console.log(`[Achievements] Granting marathon to ${user.telegram_id}`);
        user.achievements.marathon = { completed: true, date: new Date().toISOString() };
        completed.push({ ...ACHIEVEMENTS.marathon, reward: 200 });
        user.balance += 200;
    }

    if (!user.achievements.night_rider?.completed && user.night_rides >= 5) {
        console.log(`[Achievements] Granting night_rider to ${user.telegram_id}`);
        user.achievements.night_rider = { completed: true, date: new Date().toISOString() };
        completed.push({ ...ACHIEVEMENTS.night_rider, reward: 150 });
        user.balance += 150;
    }

    if (!user.achievements.rich_taxi?.completed && user.total_earned >= 10000) {
        console.log(`[Achievements] Granting rich_taxi to ${user.telegram_id}`);
        user.achievements.rich_taxi = { completed: true, date: new Date().toISOString() };
        completed.push({ ...ACHIEVEMENTS.rich_taxi, reward: 500 });
        user.balance += 500;
    }

    if (!user.achievements.first_car?.completed && user.owned_cars && user.owned_cars.length > 1) {
        console.log(`[Achievements] Granting first_car to ${user.telegram_id}`);
        user.achievements.first_car = { completed: true, date: new Date().toISOString() };
        completed.push({ ...ACHIEVEMENTS.first_car, reward: 100 });
        user.balance += 100;
    }

    return completed;
}

function getAvailablePartners(user) {
    return PARTNERS.filter(p => {
        if (p.id === user.partner_id) return false;
        return p.requirements.rides <= (user.rides_completed || 0);
    });
}

function generateOrder(user, districtId = 'suburbs') {
    const district = DISTRICTS[districtId] || DISTRICTS.suburbs;

    // v3.4: Movement Logic. Filter START location by the user's current district
    const availableFrom = LOCATIONS.filter(l => l.district === districtId);
    const from = availableFrom.length > 0
        ? availableFrom[Math.floor(Math.random() * availableFrom.length)]
        : LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];

    let targetDistrictId = districtId;
    const districtKeys = Object.keys(DISTRICTS);
    if (Math.random() < 0.3) { // 30% chance to go to another district
        const others = districtKeys.filter(d => d !== districtId && isDistrictUnlocked(DISTRICTS[d], user));
        if (others.length > 0) {
            targetDistrictId = others[Math.floor(Math.random() * others.length)];
        }
    }

    // Filter END location by the target district
    const availableTo = LOCATIONS.filter(l => l.district === targetDistrictId && l.name !== from.name);
    const to = availableTo.length > 0
        ? availableTo[Math.floor(Math.random() * availableTo.length)]
        : LOCATIONS.filter(l => l.name !== from.name)[0];

    // Distance based on district
    let distance = Math.random() * (district.distance.max - district.distance.min) + district.distance.min;
    if (targetDistrictId !== districtId) distance += 3.0; // Bonus distance for inter-district
    distance = parseFloat(distance.toFixed(1));

    // Base price with district multiplier
    let basePrice = distance * 4.0 * district.priceMultiplier;
    basePrice *= (from.base_price + to.base_price) / 2;

    // Partner bonus
    const partner = PARTNERS.find(p => p.id === user.partner_id);
    if (partner && partner.bonus_orders) {
        basePrice *= partner.bonus_orders;
    }

    // Aggregator logic (default Yodex if not specified)
    // Actually generateOrder just creates the base order proposal.
    // The player chooses aggregator when ACQUIRING or BEFORE searching.
    // Let's assume user.current_aggregator is used, OR we pass it in.
    // For now we just return base price, aggregator math happens on "Ride Complete" or here?
    // Better here to show "Potential Earnings".

    // Hardcore: Tire condition affects speed (hidden) but here maybe price? No.
    // Cleanliness affects tip chance.


    // Night bonus
    const hour = new Date().getHours();
    const is_night = hour >= 22 || hour < 6;
    if (is_night) basePrice *= 1.3;

    // VIP chance based on district
    const is_vip = Math.random() < district.vipChance;
    if (is_vip) basePrice *= 1.5;

    // v2.3: Apply global event multipliers
    if (currentEvent) {
        basePrice *= currentEvent.payMultiplier;
    }

    // Return the final order object
    const passenger = PASSENGERS[Math.floor(Math.random() * PASSENGERS.length)];
    const passengerRating = (Math.random() * (5.0 - 4.2) + 4.2).toFixed(1);

    let orderClass = 'economy';
    if (is_vip) orderClass = 'business';
    else if (districtId === 'center' || districtId === 'airport') orderClass = 'comfort';

    return {
        from: from.name,
        to: to.name,
        distance,
        price: parseFloat(basePrice.toFixed(2)),
        is_night,
        is_vip,
        district: districtId,
        targetDistrict: targetDistrictId,
        class: orderClass,
        passenger: {
            name: passenger.name,
            avatar: passenger.avatar,
            rating: passengerRating
        },
        // Calculate aggregators prices for comparison in UI
        prices: {
            yodex: {
                price: Math.floor(basePrice * AGGREGATORS.yodex.baseMultiplier),
                commission: AGGREGATORS.yodex.commission,
                color: AGGREGATORS.yodex.color
            },
            ubar: {
                price: Math.floor(basePrice * AGGREGATORS.ubar.baseMultiplier),
                commission: AGGREGATORS.ubar.commission,
                color: AGGREGATORS.ubar.color
            },
            volt: {
                price: Math.floor(basePrice * AGGREGATORS.volt.baseMultiplier),
                commission: AGGREGATORS.volt.commission,
                color: AGGREGATORS.volt.color
            }
        }
    };
}

// Generate Contraband Order (Night Only)
function generateContrabandOrder(user) {
    const risk = Math.floor(Math.random() * 50) + 30; // 30-80% risk
    const reward = Math.floor(Math.random() * 500) + 300; // 300-800 PLN
    return {
        type: 'contraband',
        description: '📦 Доставить "посылку" без лишних вопросов.',
        risk: risk,
        reward: reward,
        distance: Math.floor(Math.random() * 15) + 5
    };
}

// ============= USER CACHE (60s TTL) =============
const USER_CACHE = new Map();
const USER_CACHE_TTL = 60 * 1000; // 60 seconds

function getCachedUser(telegramId) {
    const cached = USER_CACHE.get(telegramId);
    if (cached && (Date.now() - cached.timestamp) < USER_CACHE_TTL) {
        return JSON.parse(JSON.stringify(cached.data)); // Deep clone
    }
    USER_CACHE.delete(telegramId);
    return null;
}

function setCachedUser(telegramId, user) {
    USER_CACHE.set(telegramId, {
        data: JSON.parse(JSON.stringify(user)),
        timestamp: Date.now()
    });
    // Limit cache size to 500 users
    if (USER_CACHE.size > 500) {
        const oldest = USER_CACHE.keys().next().value;
        USER_CACHE.delete(oldest);
    }
}

function invalidateUserCache(telegramId) {
    USER_CACHE.delete(telegramId);
}

async function getUser(telegramId) {
    // Check cache first
    const cached = getCachedUser(telegramId);
    if (cached) return cached;

    const row = await db.get('SELECT * FROM users WHERE telegram_id = ?', [telegramId]);
    if (!row) return null;

    // Parse JSON fields with safe defaults
    try {
        row.car = row.car_data ? JSON.parse(row.car_data) : null;
        row.owned_cars = row.owned_cars_data ? JSON.parse(row.owned_cars_data) : [];
        row.achievements = row.achievements_data ? JSON.parse(row.achievements_data) : {};
        row.business = row.business_data ? JSON.parse(row.business_data) : { rented_cars: {}, fleet: [] };
        row.lootboxes = row.lootboxes_data ? JSON.parse(row.lootboxes_data) : { wooden: 0, silver: 0, gold: 0, legendary: 0 };
        row.lootboxes_given = row.lootboxes_given_data ? JSON.parse(row.lootboxes_given_data) : {};
        row.casino_stats = row.casino_stats ? JSON.parse(row.casino_stats) : { total_won: 0, total_lost: 0, spins: 0 };
        row.skills = row.skills ? JSON.parse(row.skills) : { charisma: 0, mechanic: 0, navigator: 0 };
        row.pending_auction_rewards = row.pending_auction_rewards ? JSON.parse(row.pending_auction_rewards) : [];
    } catch (e) {
        console.error('Error parsing JSON for user', telegramId, e);
        // Ensure defaults on error
        row.owned_cars = row.owned_cars || [];
        row.achievements = row.achievements || {};
        row.business = row.business || { rented_cars: {}, fleet: [] };
        row.skills = row.skills || { charisma: 0, mechanic: 0, navigator: 0 };
        row.pending_auction_rewards = row.pending_auction_rewards || [];
    }

    // Ensure numeric types
    row.balance = parseFloat(row.balance) || 0;
    row.total_earned = parseFloat(row.total_earned) || 0;
    row.fuel = parseFloat(row.fuel) || 0;
    row.gas_fuel = parseFloat(row.gas_fuel) || 0;
    row.stamina = parseInt(row.stamina) || 0;
    row.experience = parseInt(row.experience) || 0;
    row.level = parseInt(row.level) || 1;
    row.rating = parseInt(row.rating) || 0;
    row.cleanliness = Number(row.cleanliness || 100);
    row.tire_condition = Number(row.tire_condition || 100);
    row.rides_completed = Number(row.rides_completed);
    row.total_earned = Number(row.total_earned);

    row.free_plate_rolls = parseInt(row.free_plate_rolls) || 0;

    // v3.4: Store original values for delta-based atomic updates
    row._originalBalance = row.balance;
    row._originalEarned = row.total_earned;

    // v2.3: Stamina regeneration (1 per 5 minutes)
    const now = new Date();
    if (row.last_stamina_update) {
        const lastUpdate = new Date(row.last_stamina_update);
        const minutesPassed = Math.floor((now - lastUpdate) / (1000 * 60));
        const staminaToAdd = Math.floor(minutesPassed / 5);

        if (staminaToAdd > 0) {
            row.stamina = Math.min(100, row.stamina + staminaToAdd);
            row.last_stamina_update = now.toISOString();
        }
    } else {
        row.last_stamina_update = now.toISOString();
    }

    // v2.3: Login streak tracking
    const today = now.toISOString().split('T')[0];
    const lastLogin = row.last_login_date ? row.last_login_date.split('T')[0] : null;

    if (lastLogin !== today) {
        if (lastLogin) {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            if (lastLogin === yesterdayStr) {
                row.login_streak = (row.login_streak || 0) + 1;
            } else {
                row.login_streak = 1;
            }
        } else {
            row.login_streak = 1;
        }
        row.last_login_date = now.toISOString();
    }

    // Store in cache
    setCachedUser(telegramId, row);

    // Check if user is banned
    if (row.is_banned) {
        throw new Error('USER_BANNED');
    }

    // v3.1: Log Login
    logActivity(telegramId, 'LOGIN', { level: row.level, balance: row.balance });

    return row;
}

/**
 * Helper to get a global configuration value with a default
 */
async function getConfig(key, defaultValue) {
    try {
        const row = await db.get('SELECT value FROM global_configs WHERE key = ?', [key]);
        return row ? row.value : defaultValue;
    } catch (e) {
        console.error(`Error getting config ${key}:`, e);
        return defaultValue;
    }
}

async function saveUser(user) {
    // v3.4: Use delta-based atomic updates for balance and total_earned
    const balanceDelta = user.balance - (user._originalBalance || 0);
    const earnedDelta = user.total_earned - (user._originalEarned || 0);

    const sql = `UPDATE users SET 
        balance = balance + ?, total_earned = total_earned + ?, 
        car_id = ?, car_data = ?, owned_cars_data = ?, 
        fuel = ?, gas_fuel = ?, 
        partner_id = ?, partner_contract_date = ?, 
        stamina = ?, experience = ?, level = ?, rating = ?, 
        rides_completed = ?, rides_total = ?, rides_today = ?, rides_streak = ?, night_rides = ?, total_distance = ?, 
        days_passed = ?, week_days = ?, weeks_passed = ?, 
        business_data = ?, achievements_data = ?, last_daily_bonus = ?, 
        last_stamina_update = ?, login_streak = ?, last_login_date = ?,
        lootboxes_data = ?, lootboxes_given_data = ?, casino_spins_today = ?, casino_last_reset = ?, casino_stats = ?, last_login = ?,
        skills = ?, cleanliness = ?, tire_condition = ?,
        tutorial_completed = ?, pending_auction_rewards = ?, free_plate_rolls = ?, is_banned = ?,
        current_district = ?
        WHERE telegram_id = ?`;

    const params = [
        balanceDelta, earnedDelta,
        user.car_id || user.car?.id, JSON.stringify(user.car), JSON.stringify(user.owned_cars),
        user.fuel, user.gas_fuel,
        user.partner_id, user.partner_contract_date,
        user.stamina, user.experience, user.level, user.rating,
        user.rides_completed, user.rides_total, user.rides_today, user.rides_streak, user.night_rides, user.total_distance,
        user.days_passed, user.week_days, user.weeks_passed,
        JSON.stringify(user.business || { rented_cars: {} }),
        JSON.stringify(user.achievements),
        user.last_daily_bonus,
        user.last_stamina_update,
        user.login_streak || 0,
        user.last_login_date,
        JSON.stringify(user.lootboxes || { wooden: 0, silver: 0, gold: 0, legendary: 0 }),
        JSON.stringify(user.lootboxes_given || {}),
        user.casino_spins_today || 0,
        user.casino_last_reset,
        JSON.stringify(user.casino_stats || { total_won: 0, total_lost: 0, spins: 0 }),
        new Date().toISOString(),
        JSON.stringify(user.skills || { charisma: 0, mechanic: 0, navigator: 0 }),
        user.cleanliness || 100,
        user.tire_condition || 100,
        user.tutorial_completed || 0,
        JSON.stringify(user.pending_auction_rewards || []),
        user.free_plate_rolls || 0,
        user.is_banned || 0,
        user.current_district || 'suburbs',
        user.telegram_id
    ];

    await db.run(sql, params);

    // Update original values for future saves in the same request life
    user._originalBalance = user.balance;
    user._originalEarned = user.total_earned;

    // Invalidate cache on save
    invalidateUserCache(user.telegram_id);
    console.log(`[DB] Saved user ${user.telegram_id}. Delta Balance: ${balanceDelta > 0 ? '+' : ''}${balanceDelta}, Final Ref: ${user.balance}`);
}

/**
 * v3.4: Helper for atomic balance updates to prevent race conditions.
 * Always invalidates cache.
 */
async function updateBalanceAtomic(telegramId, amount, updateTotalEarned = false) {
    if (isNaN(amount)) return;

    let sql = 'UPDATE users SET balance = balance + ?';
    const params = [amount];

    if (updateTotalEarned && amount > 0) {
        sql += ', total_earned = total_earned + ?';
        params.push(amount);
    }

    sql += ' WHERE telegram_id = ?';
    params.push(telegramId);

    await db.run(sql, params);
    invalidateUserCache(telegramId);
    console.log(`[DB] Atomic balance update for ${telegramId}: ${amount > 0 ? '+' : ''}${amount}. (Earnings: ${updateTotalEarned})`);
}

// v2.9: Mark tutorial complete
app.post('/api/user/:telegramId/tutorial-complete', async (req, res) => {
    try {
        const user = await getUser(req.params.telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        user.tutorial_completed = 1;
        await saveUser(user);
        res.json({ success: true });
    } catch (error) {
        console.error('Error marking tutorial complete:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// v3.4: Social Pulse & Community Mission
app.get('/api/social/pulse', async (req, res) => {
    try {
        // 1. Get real distance from history (Community Mission)
        const distanceRow = await db.get('SELECT SUM(distance) as total FROM orders_history');
        const realDistance = parseFloat(distanceRow?.total || 0);

        // 2. District occupancy (Simulated with slight randomness based on real time)
        const hour = new Date().getHours();
        const baseOccupancy = (hour > 8 && hour < 22) ? 1.5 : 0.7; // Peak/Off-peak multiplier

        const occupancy = {
            suburbs: Math.floor((Math.random() * 10 + 5) * baseOccupancy),
            center: Math.floor((Math.random() * 20 + 15) * baseOccupancy),
            airport: Math.floor((Math.random() * 12 + 8) * baseOccupancy)
        };

        // 3. Simulated Street Feed events if real log is empty
        let events = [...SOCIAL_ACTIVITY_LOG];
        if (events.length < 5) {
            const fakeNames = ['Alex', 'Marek', 'TaxiPro', 'VIP_Driver', 'Ghost', 'Turbo', 'NightOwl'];
            const fakeActions = [
                'выполнил заказ в Центре! 🚕',
                'купил новую машину! 🚙',
                'выбил редкий госномер! 🆔',
                'сорвал куш в слотах! 🎰',
                'завершил смену с чаевыми 50 PLN! 💰'
            ];
            for (let i = 0; i < 3; i++) {
                const name = fakeNames[Math.floor(Math.random() * fakeNames.length)];
                const action = fakeActions[Math.floor(Math.random() * fakeActions.length)];
                events.push({ message: `${name} ${action}`, timestamp: new Date().toISOString() });
            }
        }

        // 4. Surge pricing indicators (Visual only for now)
        const surges = {};
        if (hour >= 17 && hour <= 19) surges.center = 1.2;
        if (Math.random() < 0.2) surges.airport = 1.3;

        res.json({
            community: {
                totalDistance: Number(realDistance.toFixed(1)),
                goal: COMMUNITY_DISTANCE_GOAL,
                percent: Math.min(100, (realDistance / COMMUNITY_DISTANCE_GOAL) * 100).toFixed(1)
            },
            occupancy,
            events: events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 10),
            surges,
            jackpot: Number(JACKPOT_POOL.toFixed(2))
        });
    } catch (e) {
        console.error('Pulse error:', e);
        res.status(500).json({ error: 'Pulse failed' });
    }
});

// ============= API ENDPOINTS =============

app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Server is running with SQLite persistence',
        timestamp: new Date()
    });
});

// Получение данных пользователя
app.get('/api/user/:telegramId', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const { username } = req.query;
        let user = await getUser(telegramId);

        if (!user) {
            const now = new Date();
            // Create user
            const newUser = {
                telegram_id: telegramId,
                id: Date.now().toString(),
                balance: 250.00,
                total_earned: 0,
                car_id: 'fabia_blue_rent',
                car: { ...CARS.fabia_blue_rent }, // Unsafe reference fixed
                owned_cars: ['fabia_blue_rent'],
                fuel: 45.0,
                gas_fuel: 0,
                partner_id: 1,
                partner_contract_date: now.toISOString(),
                stamina: 100,
                experience: 0,
                level: 1,
                rating: 0,
                rides_completed: 0,
                rides_total: 0,
                rides_today: 0,
                rides_streak: 0,
                night_rides: 0,
                total_distance: 0,
                days_passed: 0,
                week_days: 0,
                weeks_passed: 0,
                achievements: {},
                skills: { charisma: 0, mechanic: 0, navigator: 0 },
                cleanliness: 100,
                tire_condition: 100,
                created_at: now.toISOString(),
                last_login: now.toISOString(),
                username: username || 'Таксист'
            };

            await db.run(`INSERT INTO users (
                id, telegram_id, balance, total_earned, 
                car_id, car_data, owned_cars_data, 
                fuel, gas_fuel, 
                partner_id, partner_contract_date, 
                stamina, experience, level, rating, 
                rides_completed, rides_total, rides_today, rides_streak, night_rides, total_distance, 
                days_passed, week_days, weeks_passed, 
                business_data, achievements_data, 
                skills, cleanliness, tire_condition,
                lootboxes_data, lootboxes_given_data,
                created_at, last_login, username
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                newUser.id, newUser.telegram_id, newUser.balance, newUser.total_earned,
                newUser.car_id, JSON.stringify(newUser.car), JSON.stringify(newUser.owned_cars),
                newUser.fuel, newUser.gas_fuel,
                newUser.partner_id, newUser.partner_contract_date,
                newUser.stamina, newUser.experience, newUser.level, newUser.rating,
                newUser.rides_completed, newUser.rides_total, newUser.rides_today, newUser.rides_streak, newUser.night_rides, newUser.total_distance,
                newUser.days_passed, newUser.week_days, newUser.weeks_passed,
                JSON.stringify({ rented_cars: {} }),
                JSON.stringify(newUser.achievements),
                JSON.stringify(newUser.skills), newUser.cleanliness, newUser.tire_condition,
                JSON.stringify({ wooden: 0, silver: 0, gold: 0, legendary: 0 }),
                JSON.stringify({ wooden: 0, silver: 0, gold: 0, legendary: 0 }),
                newUser.created_at, newUser.last_login, newUser.username
            ]);

            user = newUser;
        } else if (username && user.username !== username) {
            // Update username if it changed or was missing
            user.username = username;
            await db.run('UPDATE users SET username = ? WHERE telegram_id = ?', [username, telegramId]);
        }

        const partner = PARTNERS.find(p => p.id === user.partner_id);
        const availablePartners = getAvailablePartners(user);

        res.json({
            id: user.id,
            balance: Number(user.balance.toFixed(2)),
            total_earned: Number(user.total_earned.toFixed(2)),

            car: user.car,
            car_id: user.car_id,
            owned_cars: user.owned_cars,

            fuel: Number(user.fuel.toFixed(3)),
            max_fuel: user.car.tank_capacity,
            has_gas: user.car.has_gas || false,
            gas_fuel: Number(user.gas_fuel || 0),
            gas_max_fuel: user.car.gas_tank_capacity || 0,
            fuel_consumption: user.car.fuel_consumption,
            gas_consumption: user.car.gas_consumption || 0,

            rating: user.rating,
            rides_completed: user.rides_completed,

            partner: partner,
            partner_id: user.partner_id,
            weekly_payment: partner?.weekly_cost || 0,
            available_partners: availablePartners,

            stamina: user.stamina,
            experience: user.experience,
            level: user.level,

            rides_total: user.rides_total,
            rides_today: user.rides_today,
            rides_streak: user.rides_streak,

            days_passed: user.days_passed || 0,
            week_days: user.week_days || 0,
            weeks_passed: user.weeks_passed || 0,

            business: user.business || { rented_cars: {}, fleet: [] },
            skills: user.skills || { charisma: 0, mechanic: 0, navigator: 0 },
            cleanliness: user.cleanliness || 100,
            tire_condition: user.tire_condition || 100,

            achievements: Object.keys(user.achievements || {}).reduce((acc, id) => {
                if (user.achievements[id] && user.achievements[id].completed && ACHIEVEMENTS[id]) {
                    acc[id] = { ...ACHIEVEMENTS[id], completed: true, date: user.achievements[id].date };
                }
                return acc;
            }, {}),
            pending_auction_rewards: user.pending_auction_rewards || [],
            tutorial_completed: user.tutorial_completed || 0,
            current_district: user.current_district || 'suburbs',
            jackpot_pool: Number(JACKPOT_POOL.toFixed(2))
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// v2.2: Get available districts
app.get('/api/user/:telegramId/districts', async (req, res) => {
    try {
        const user = await getUser(req.params.telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const districts = Object.values(DISTRICTS).map(d => ({
            ...d,
            unlocked: isDistrictUnlocked(d, user)
        }));

        res.json(districts);
    } catch (error) {
        console.error('Error getting districts:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Генерация заказов
app.get('/api/orders/:telegramId', async (req, res) => {
    try {
        const user = await getUser(req.params.telegramId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const district = req.query.district || user.current_district || 'suburbs';
        const count = parseInt(req.query.count) || 5;

        const orders = [];
        const orderIds = {}; // For faster lookup

        for (let i = 0; i < count; i++) {
            const order = generateOrder(user, district);
            const orderId = `ord_${Math.random().toString(36).substr(2, 9)}`;
            order.id = orderId;
            orders.push(order);
            orderIds[orderId] = order;
        }

        // Save to cache
        ORDERS_CACHE.set(req.params.telegramId, {
            orders: orderIds,
            timestamp: Date.now()
        });

        res.json(orders);

    } catch (error) {
        console.error('Error generating orders:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Выполнение заказа
app.post('/api/user/:telegramId/ride', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const { useGas } = req.body;

        const user = await getUser(telegramId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // v3.1: Server-side order validation
        const userOrders = ORDERS_CACHE.get(telegramId);
        const orderId = typeof req.body.order === 'string' ? req.body.order : req.body.order?.id;

        if (!userOrders || !userOrders.orders[orderId]) {
            return res.status(400).json({ error: 'Заказ не найден или уже выполнен' });
        }

        const order = userOrders.orders[orderId];
        // Remove from cache immediately to prevent double-claim
        delete userOrders.orders[orderId];

        if (user.stamina <= 0) {
            return res.status(400).json({ error: 'Слишком устали! Отдохните.' });
        }

        // Расчет расхода топлива
        let fuelNeeded;
        let fuelType;

        if (useGas && user.car.has_gas) {
            fuelNeeded = (user.car.gas_consumption / 100) * order.distance;
            fuelType = 'gas';
        } else {
            fuelNeeded = (user.car.fuel_consumption / 100) * order.distance;
            fuelType = 'petrol';
        }

        // Проверка наличия топлива
        const partner = PARTNERS.find(p => p.id === user.partner_id);
        const fuelProvidedByPartner = partner && partner.fuel_provided;

        if (fuelType === 'gas') {
            if (!fuelProvidedByPartner) {
                if (user.gas_fuel < fuelNeeded) {
                    return res.status(400).json({ error: 'Недостаточно газа' });
                }
                user.gas_fuel -= fuelNeeded;
            }
        } else {
            if (!fuelProvidedByPartner) {
                if (user.fuel < fuelNeeded) {
                    return res.status(400).json({ error: 'Недостаточно топлива' });
                }
                user.fuel = Math.max(0, user.fuel - fuelNeeded);
            }
        }

        // Hardcoded safety for fuel subtraction issues (NaN checks)
        if (isNaN(user.fuel)) user.fuel = 0;
        if (isNaN(user.gas_fuel)) user.gas_fuel = 0;

        // Расчет дохода
        let earnings = order.price;

        if (partner) {
            earnings *= (1 - partner.revenue_split);
        }

        // v3.3: Plate Buffs
        const plateBuffs = user.car.plate?.buffs || { tip_multiplier: 1.0, police_resistance: 1.0 };
        earnings *= (plateBuffs.tip_multiplier || 1.0);

        // --- v2.1 Features ---
        let event = null;

        // 1. Car Wear (Only for owned cars)
        if (user.car.is_owned) {
            const wear = (order.distance / 100); // 1% per 100km (approx)
            user.car.condition = Math.max(0, (user.car.condition || 100) - wear);
        }

        // 2. Random Events (10% normal, 7% police)
        const policeChance = 0.07 * (plateBuffs.police_resistance || 1.0);
        const policeRoll = Math.random();
        if (policeRoll < policeChance) {
            event = {
                type: 'police_stopped',
                message: '👮 Вас остановил патруль ГАИ!',
                fine: 300,
                amount: -300, // Also supporting amount property
                icon: '🚨'
            };
        } else if (Math.random() < 0.1) {
            const events = [
                { type: 'fine', text: '👮 Вы превысили скорость! Штраф 50 PLN', amount: -50, icon: '🚨' },
                { type: 'tip', text: '💰 Клиент оставил щедрые чаевые!', amount: 50, icon: '💸' },
                { type: 'pothole', text: '💥 Вы влетели в яму! Подвеска повреждена.', wear: 5, icon: '🚧' },
                { type: 'traffic', text: '🚦 Пробки... Вы потратили больше выносливости.', stamina: -10, icon: '🚗' }
            ];
            const randomEvent = events[Math.floor(Math.random() * events.length)];

            if (randomEvent.amount) {
                user.balance += randomEvent.amount;
                event = randomEvent;
            } else if (randomEvent.wear && user.car.is_owned) {
                user.car.condition = Math.max(0, (user.car.condition || 100) - randomEvent.wear);
                event = randomEvent;
            } else if (randomEvent.stamina) {
                user.stamina = Math.max(0, user.stamina + randomEvent.stamina);
                event = randomEvent;
            }
        }

        // ---------------------

        // Обновление статистики
        user.balance += earnings;
        user.total_earned += earnings;
        user.rides_completed++;
        user.rides_total++;
        user.rides_today++;
        user.rides_streak++;
        user.rating += Math.floor(order.distance);
        user.stamina = Math.max(0, user.stamina - 15);
        user.experience += Math.floor(order.distance);
        user.total_distance += order.distance;

        if (order.is_night) {
            user.night_rides++;
        }

        // v3.4: Real Movement - Update user location to order destination
        const oldDistrict = user.current_district;
        if (order.targetDistrict) {
            user.current_district = order.targetDistrict;
            logSocialActivity(`🚖 ${user.username || 'Водитель'} переехал из ${DISTRICTS[oldDistrict]?.name || oldDistrict} в ${DISTRICTS[user.current_district]?.name || user.current_district}`);
        }

        // Проверка уровня
        const newLevel = Math.floor(user.experience / 100) + 1;
        if (newLevel > user.level) {
            user.level = newLevel;
            user.stamina = 100;
        }

        // Проверка достижений
        const newAchievements = checkAchievements(user);

        // === JACKPOT: 0.1% from each ride goes to pool ===
        const jackpotContribution = earnings * 0.001;
        JACKPOT_POOL += jackpotContribution;

        // Random jackpot trigger: 1 in 10000 chance per ride
        let jackpotWin = null;
        if (Math.random() < 0.0001 && JACKPOT_POOL >= 100) {
            jackpotWin = Math.floor(JACKPOT_POOL);
            user.balance += jackpotWin;
            JACKPOT_POOL = 0;
            // Log jackpot win
            try {
                await db.run('INSERT INTO jackpot_history (winner_id, amount, won_at) VALUES (?, ?, ?)',
                    [user.id, jackpotWin, new Date().toISOString()]);

                // v3.4: Add to social activity
                logSocialActivity(`${user.username || 'Игрок'} выиграл ДЖЕКПОТ ${jackpotWin} PLN! 🎰`);
            } catch (e) { console.error('Jackpot log error:', e); }
        }
        await saveJackpot();

        // Сохраняем в историю и обновляем юзера
        await db.run(`INSERT INTO orders_history (user_id, price, distance, fuel_used, fuel_type, completed_at, district_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [user.id, earnings, order.distance, fuelNeeded, fuelType, new Date().toISOString(), order.district]);

        await saveUser(user);

        logActivity(telegramId, 'COMPLETE_RIDE', {
            earnings: Number(earnings.toFixed(2)),
            distance: order.distance,
            district: order.district,
            fuel_type: fuelType
        });

        res.json({
            success: true,
            new_balance: Number(user.balance.toFixed(2)),
            new_fuel: Number(user.fuel.toFixed(3)),
            new_gas_fuel: Number(user.gas_fuel || 0).toFixed(3),
            earnings: Number(earnings.toFixed(2)),
            fuel_used: fuelProvidedByPartner ? 0 : Number(fuelNeeded.toFixed(3)),
            fuel_type: fuelType,
            stamina: user.stamina,
            experience: user.experience,
            level: user.level,
            rating: user.rating,
            event: event ? {
                message: event.message,
                icon: event.icon,
                type: event.type
            } : null,
            new_achievements: newAchievements,
            jackpot_pool: Number(JACKPOT_POOL.toFixed(2)),
            jackpot_win: jackpotWin
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Отдых
app.post('/api/user/:telegramId/rest', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const user = await getUser(telegramId);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Счётчики дней и недель
        user.days_passed = (user.days_passed || 0) + 1;
        user.week_days = (user.week_days || 0) + 1;

        // Полная неделя прошла?
        let week_completed = false;
        let rent_paid = false;
        let rent_amount = 0;
        let not_enough_money = false;

        if (user.week_days >= 7) {
            week_completed = true;
            user.weeks_passed = (user.weeks_passed || 0) + 1;
            user.week_days = 0;

            // Проверяем партнёра (если есть еженедельная плата)
            const partner = PARTNERS.find(p => p.id === user.partner_id);
            if (partner && partner.weekly_cost > 0) {
                if (user.balance >= partner.weekly_cost) {
                    user.balance -= partner.weekly_cost;
                    rent_paid = true;
                    rent_amount = partner.weekly_cost;
                } else {
                    not_enough_money = true;
                }
            }

            // Проверяем аренду машины
            if (user.car && user.car.rent_price && user.car.rent_price > 0 && !user.car.is_owned) {
                if (user.balance >= user.car.rent_price) {
                    user.balance -= user.car.rent_price;
                    rent_paid = true;
                    rent_amount += user.car.rent_price;
                } else {
                    not_enough_money = true;
                    // Забираем машину и возвращаем на стартовую
                    user.car_id = 'fabia_blue_rent';
                    user.car = { ...CARS.fabia_blue_rent };
                }
            }
        }

        // Восстанавливаем выносливость
        user.stamina = Math.min(100, (user.stamina || 0) + 30);
        user.rides_streak = 0;
        user.rides_today = 0; // New day resets daily rides

        await saveUser(user);

        // Формируем ответ
        let message = '😴 Вы отдохнули и восстановили 30% выносливости!';
        let day_info = `📅 День: ${user.days_passed} (${user.week_days}/7)`;

        if (week_completed) {
            message += `\n✅ Неделя ${user.weeks_passed} завершена!`;
            day_info += `\n📊 Неделя: ${user.weeks_passed}`;

            if (rent_paid) {
                message += `\n💳 Снята плата: ${rent_amount} PLN`;
            }
            if (not_enough_money) {
                message += `\n⚠️ Недостаточно средств для некоторых платежей`;
            }

            // --- FLEET INCOME CALCULATION ---
            let fleetIncome = 0;
            const business = user.business || { rented_cars: {} };
            const rentedCars = business.rented_cars || {};

            for (const [carId, rentInfo] of Object.entries(rentedCars)) {
                const carDef = CARS[carId];
                if (carDef && carDef.purchase_price) {
                    // Weekly income = 10% of purchase price
                    fleetIncome += Math.floor(carDef.purchase_price * 0.1);
                }
            }

            if (fleetIncome > 0) {
                user.balance += fleetIncome;
                user.total_earned += fleetIncome; // Count as earnings? logical.
                message += `\n💼 Доход автопарка: +${fleetIncome} PLN`;
            }
            // --------------------------------
        }

        res.json({
            success: true,
            stamina: user.stamina,
            message: message,
            days_passed: user.days_passed,
            week_days: user.week_days,
            weeks_passed: user.weeks_passed || 0,
            week_completed: week_completed,
            rent_paid: rent_paid,
            rent_amount: rent_amount,
            new_balance: Number(user.balance.toFixed(2)),
            day_info: day_info
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Заправка топлива
app.post('/api/user/:telegramId/fuel', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const { liters, type } = req.body;

        const user = await getUser(telegramId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (type === 'gas' && !user.car.has_gas) {
            return res.status(400).json({ error: 'У этой машины нет ГБО' });
        }

        const petrolPrice = parseFloat(await getConfig('petrol_price', '6.80'));
        const gasPrice = parseFloat(await getConfig('gas_price', '3.60'));

        const requestedLiters = Math.max(1, Math.round(liters));

        let pricePerLiter, maxFuel, currentFuel;

        if (type === 'gas' && user.car.has_gas) {
            pricePerLiter = gasPrice;
            maxFuel = user.car.gas_tank_capacity || 40;
            currentFuel = user.gas_fuel || 0;
        } else {
            pricePerLiter = petrolPrice;
            maxFuel = user.car.tank_capacity;
            currentFuel = user.fuel;
        }

        const maxPossibleLiters = Number((maxFuel - currentFuel).toFixed(1));

        if (maxPossibleLiters <= 0) {
            return res.status(400).json({ error: 'Бак уже полный' });
        }

        const actualLiters = Math.min(requestedLiters, maxPossibleLiters);
        const actualLitersRounded = Number(actualLiters.toFixed(1));

        const districtId = user.current_district || 'suburbs';
        // Randomly pick an owned station in the district (usually only 1 or 2 available)
        const station = await db.get('SELECT * FROM gas_stations WHERE district_id = ? AND owner_id IS NOT NULL ORDER BY RANDOM() LIMIT 1', [districtId]);

        let effectivePetrolPrice = 6.80; // Default
        let effectiveGasPrice = 3.60;

        if (station) {
            if (station.price_petrol) effectivePetrolPrice = station.price_petrol;
            if (station.price_gas) effectiveGasPrice = station.price_gas;
        }

        const pricePerLitre = type === 'gas' ? effectiveGasPrice : effectivePetrolPrice;
        const cost = Number((actualLitersRounded * pricePerLitre).toFixed(2));

        if (user.balance < cost) {
            return res.status(400).json({ error: 'Недостаточно денег' });
        }

        user.balance = Number((user.balance - cost).toFixed(2));
        if (type === 'gas') {
            user.gas_fuel = Number((currentFuel + actualLitersRounded).toFixed(1));
        } else {
            user.fuel = Number((currentFuel + actualLitersRounded).toFixed(1));
        }

        // Commission payout
        const commission = Number((cost * 0.05).toFixed(2));
        if (station && station.owner_id !== telegramId) {
            // Pay commission to owner
            await db.run('UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE telegram_id = ?', [commission, commission, station.owner_id]);
            await db.run('UPDATE gas_stations SET revenue_total = revenue_total + ? WHERE id = ?', [commission, station.id]);

            // Sync user cache for the owner
            const owner = await getUserFromDB(station.owner_id);
            if (owner) USER_CACHE.set(station.owner_id, owner);
            console.log(`[Investment] Paid ${commission.toFixed(2)} PLN commission to ${station.owner_id} for refueling at ${station.name}`);
        }

        await saveUser(user);

        logActivity(telegramId, 'REFUEL', { liters: actualLitersRounded, cost, fuel_type: type });

        res.json({
            success: true,
            new_balance: user.balance,
            new_fuel: user.fuel,
            new_gas_fuel: user.gas_fuel || 0,
            liters_added: actualLitersRounded,
            cost: cost,
            fuel_type: type,
            message: `⛽ Заправлено ${actualLitersRounded} л ${type === 'gas' ? 'газа' : 'бензина'} за ${cost} PLN`
        });

    } catch (error) {
        console.error('❌ Ошибка заправки:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Смена партнёра
app.post('/api/user/:telegramId/police/settle', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const { action } = req.body;
        const user = await getUser(telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const fine = 300;
        let result = { success: true, action };

        if (action === 'pay') {
            user.balance = Math.max(0, user.balance - fine);
            result.message = `✅ Вы оплатили штраф ${fine} PLN через терминал.`;
            result.paid = fine;
        } else if (action === 'bribe') {
            const success = Math.random() < 0.5;
            if (success) {
                const cost = Math.floor(fine / 2);
                user.balance = Math.max(0, user.balance - cost);
                result.message = `🤫 Удалось договориться! Вы отдали ${cost} PLN "на месте".`;
                result.paid = cost;
                result.outcome = 'success';
            } else {
                const penalty = fine * 2;
                user.balance = Math.max(0, user.balance - penalty);
                result.message = `❌ Попытка дать взятку провалилась! Составлен протокол на ${penalty} PLN.`;
                result.paid = penalty;
                result.outcome = 'fail';
            }
        }

        await saveUser(user);
        res.json({ ...result, new_balance: user.balance });
    } catch (e) {
        console.error('Police settle error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Смена партнёра
app.post('/api/user/:telegramId/partner', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const { partnerId } = req.body;

        const user = await getUser(telegramId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const newPartner = PARTNERS.find(p => p.id === partnerId);
        if (!newPartner) {
            return res.status(404).json({ error: 'Партнёр не найден' });
        }

        if (newPartner.requirements.rides > (user.rides_completed || 0)) {
            return res.status(400).json({
                error: `Нужно выполнить ${newPartner.requirements.rides} заказов (сейчас ${user.rides_completed || 0})`
            });
        }

        user.partner_id = partnerId;
        user.partner_contract_date = new Date().toISOString();

        await saveUser(user);

        res.json({
            success: true,
            new_partner: newPartner,
            message: `✅ Теперь вы работаете с партнёром: ${newPartner.name}`
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Покупка машины
app.post('/api/user/:telegramId/buy-car', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const { carId } = req.body;

        const user = await getUser(telegramId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const car = CARS[carId];
        if (!car) {
            return res.status(404).json({ error: 'Car not found' });
        }

        if (!car.purchase_price || car.purchase_price === 0) {
            return res.status(400).json({ error: 'Эту машину нельзя купить' });
        }

        if (user.balance < car.purchase_price) {
            return res.status(400).json({ error: 'Недостаточно средств' });
        }

        user.balance -= car.purchase_price;
        user.car_id = carId;
        user.car = { ...car, is_owned: true, rent_price: 0 };
        // Ensure not duplicating car ID in array
        if (!user.owned_cars.includes(carId)) {
            user.owned_cars.push(carId);
        }

        // Full tank bonus
        user.fuel = car.tank_capacity;
        if (car.has_gas) {
            user.gas_fuel = car.gas_tank_capacity;
        }

        // Check achievements
        const achievements = checkAchievements(user);

        await saveUser(user);

        res.json({
            success: true,
            new_balance: user.balance,
            new_car: user.car,
            message: `🎉 Вы купили ${car.name}`,
            new_achievements: achievements
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Аренда машины
app.post('/api/user/:telegramId/rent-car', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const { carId } = req.body;

        const user = await getUser(telegramId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const car = CARS[carId];
        if (!car || !car.rent_price) {
            return res.status(404).json({ error: 'Car not found or not available for rent' });
        }

        if (user.balance < car.rent_price) {
            return res.status(400).json({ error: 'Недостаточно средств для первого платежа' });
        }

        user.balance -= car.rent_price;
        user.car_id = carId;
        user.car = { ...car, is_owned: false };

        // Avoid adding rented cars to owned_cars list if they shouldn't be there permanently
        // But logic says owned_cars is good for unlocked cars. Rented cars aren't "owned" per se.
        // If switching logic relies on owned_cars, rented ones shouldn't be added there unless they persist.
        // For simplicity, we track owned_cars only for PURCHASED cars and the default one.

        user.fuel = car.tank_capacity;

        await saveUser(user);

        res.json({
            success: true,
            new_balance: user.balance,
            new_car: user.car,
            message: `🚗 Вы арендовали ${car.name}`
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Select car (Switch to owned car) - NEW
app.post('/api/user/:telegramId/select-car', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const { carId } = req.body;

        const user = await getUser(telegramId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!user.owned_cars.includes(carId)) {
            return res.status(403).json({ error: 'Вы не владеете этой машиной' });
        }

        const car = CARS[carId];
        if (!car) {
            return res.status(404).json({ error: 'Car definition missing' });
        }

        // Switch car
        user.car_id = carId;
        user.car = { ...car, is_owned: true, rent_price: 0 }; // When selecting from owned list, it's owned

        // Optional: restore fuel level from some persistent storage per car? 
        // For now complex: just keep current logical fuel or reset?
        // Let's reset to full capacity as a "bonus" for switching or just keep it simple?
        // Simpler: Set to current capacity max if current fuel > new max
        user.fuel = Math.min(user.fuel, user.car.tank_capacity);

        await saveUser(user);

        res.json({
            success: true,
            new_car: user.car,
            message: `🚗 Вы пересели на ${car.name}`
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Получение доступных машин (Available to BUY or RENT)
app.get('/api/user/:telegramId/available-cars', async (req, res) => {
    try {
        const user = await getUser(req.params.telegramId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const allCars = Object.values(CARS);
        // Exclude cars already owned by the user
        const availableCars = allCars.filter(car => !user.owned_cars.includes(car.id));

        res.json(availableCars);

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get User Garage (Owned cars) - NEW
app.get('/api/user/:telegramId/garage', async (req, res) => {
    try {
        const user = await getUser(req.params.telegramId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const myCars = user.owned_cars.map(id => {
            const carDef = CARS[id];
            if (!carDef) return null;
            return {
                ...carDef,
                is_owned: true,
                is_selected: user.car_id === id
            };
        }).filter(c => c !== null);

        res.json(myCars);

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============= НОВЫЕ ЭНДПОИНТЫ (v2.1) =============

// Ежедневный бонус
app.post('/api/user/:telegramId/daily-bonus', async (req, res) => {
    try {
        const user = await getUser(req.params.telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const now = new Date();
        const lastBonus = user.last_daily_bonus ? new Date(user.last_daily_bonus) : null;

        // Check if 24h passed
        if (lastBonus && (now - lastBonus) < 24 * 60 * 60 * 1000) {
            const timeLeft = 24 * 60 * 60 * 1000 - (now - lastBonus);
            return res.status(400).json({ error: 'Bonus not available yet', timeLeft });
        }

        // Reward logic (Roulette)
        const rewards = [
            { type: 'money', value: 100, label: '💰 100 PLN' },
            { type: 'money', value: 250, label: '💰 250 PLN' },
            { type: 'fuel', value: 10, label: '⛽ 10 Литра' },
            { type: 'fuel', value: 45, label: '⛽ Полный бак' },
            { type: 'money', value: 500, label: '💰 500 PLN (Jackpot!)' }
        ];

        // Simple weighted random could be here, but let's do uniform for now
        const reward = rewards[Math.floor(Math.random() * rewards.length)];

        if (reward.type === 'money') {
            user.balance += reward.value;
            user.total_earned += reward.value;
        } else if (reward.type === 'fuel') {
            user.fuel = Math.min(user.car.tank_capacity, user.fuel + reward.value);
        }

        user.last_daily_bonus = now.toISOString();
        await saveUser(user);

        res.json({ success: true, reward });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Repair Car
app.post('/api/user/:telegramId/repair', async (req, res) => {
    try {
        const user = await getUser(req.params.telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (!user.car.is_owned) {
            return res.status(400).json({ error: 'Нельзя чинить арендованное авто' });
        }

        const cost = parseFloat(await getConfig('repair_cost', '150'));
        if (user.balance < cost) {
            return res.status(400).json({ error: 'Недостаточно денег' });
        }

        user.balance -= cost;
        user.car.condition = 100;

        // Update in owned_cars array too
        const carIndex = user.owned_cars.indexOf(user.car_id);
        if (carIndex !== -1) {
            // We need to update the structure if we store full objects, 
            // but we store only IDs in owned_cars array? 
            // Wait, server.js logic says: owned_cars is ARRAY of IDs.
            // But getUser parses it. 
            // Actually, previously we just stored IDs. 
            // But wait, if we want to store condition PER CAR, we need to store objects or a map.
            // CURRENT IMPLEMENTATION CHECK: 
            // user.owned_cars = JSON.parse(row.owned_cars_data); -> This is likely [ 'id1', 'id2' ]
            // So we don't store unique data per owned car yet.
            // FIX: For now, let's just update the ACTIVE car's condition. 
            // To properly support multi-car condition, we'd need a big refactor of owned_cars_data structure 
            // from string[] to object{id: {condition: 100}}.
            // Let's stick to simple version: You repair the car you are DRIVING. 
            // And if you switch, well, condition resets or is shared? 
            // Let's implement: Condition is part of user.car. 
            // If we switch cars, we generate it from CARS constant.
            // To make it persistent per car, we need to change owned_cars_data schema.
            // For MVP v2.1: We will only track condition on the ACTIVE car and save it to `car_data`. 
            // Detailed per-car persistence is a larger task (Task 5+).
        }

        await saveUser(user);
        res.json({ success: true, balance: user.balance, car: user.car });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============= v2.6: SKILLS & UPGRADES =============

// v2.6: SKILLS & UPGRADES moved to consolidated endpoint below

// Redundant v2.6 auction routes removed

// ============= v2.6: HARDCORE (WASHING) =============
app.post('/api/user/:telegramId/car-wash', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const user = await getUser(telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const cost = parseFloat(await getConfig('car_wash_cost', '50'));
        if (user.balance < cost) return res.status(400).json({ error: 'Недостаточно денег' });

        user.balance -= cost;
        user.cleanliness = 100;

        await saveUser(user);
        res.json({ success: true, balance: user.balance, cleanliness: 100 });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============= v2.6: BUSINESS (DRIVERS) =============
app.get('/api/user/:telegramId/business', async (req, res) => {
    try {
        const user = await getUser(req.params.telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Get drivers from DB
        const drivers = await db.query('SELECT * FROM drivers WHERE user_id = ?', [user.id]);

        // Calculate potential earnings for idle drivers
        const now = new Date();
        drivers.forEach(d => {
            if (d.last_collection) {
                const last = new Date(d.last_collection);
                const hours = Math.abs(now - last) / 36e5;
                d.pending_earnings = Math.floor(hours * (d.skill * 10)); // 10 PLN/hour per skill level
            } else {
                d.pending_earnings = 0;
            }
        });

        // Map fleet entries to full car info
        const business = user.business || { fleet: [] };
        const fleet = (business.fleet || [])
            .filter(item => item !== null)
            .map(item => {
                const modelId = typeof item === 'string' ? item : item.modelId;
                const instanceId = typeof item === 'string' ? item : item.id;
                const car = CARS[modelId];
                return {
                    id: instanceId,
                    modelId: modelId,
                    name: car ? car.name : (modelId || 'Unknown'),
                    image: car ? car.image : '🚗'
                };
            });

        res.json({ success: true, drivers, fleet, currentCarId: user.car_id, balance: user.balance });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Buy a car for fleet
app.post('/api/user/:telegramId/fleet/buy', async (req, res) => {
    try {
        const user = await getUser(req.params.telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const { carId } = req.body;
        const car = CARS[carId];
        if (!car) return res.status(400).json({ error: 'Машина не найдена' });
        if (car.purchase_price <= 0) return res.status(400).json({ error: 'Эту машину нельзя купить' });
        if (user.balance < car.purchase_price) return res.status(400).json({ error: 'Недостаточно средств' });

        user.balance -= car.purchase_price;
        user.business = user.business || { rented_cars: {}, fleet: [], drivers: [] };
        user.business.fleet = user.business.fleet || [];

        const instanceId = `fleet_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        user.business.fleet.push({
            id: instanceId,
            modelId: carId,
            acquiredAt: new Date().toISOString()
        });

        await saveUser(user);

        res.json({
            success: true,
            message: `🚗 Куплена ${car.name} для автопарка!`,
            balance: user.balance,
            instanceId
        });
    } catch (error) {
        console.error('Error buying fleet car:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/user/:telegramId/drivers/hire', async (req, res) => {
    try {
        const user = await getUser(req.params.telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const HIRE_COST = 1000;
        if (user.balance < HIRE_COST) return res.status(400).json({ error: 'Not enough money' });

        const names = ['Ivan', 'Dmitry', 'Olga', 'Svetlana', 'Alex', 'Max'];
        const name = names[Math.floor(Math.random() * names.length)];
        const skill = Math.floor(Math.random() * 3) + 1; // 1-3

        user.balance -= HIRE_COST;
        await saveUser(user);

        await db.run(`INSERT INTO drivers (user_id, name, skill, trust, salary, hired_at, last_collection) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [user.id, name, skill, 50, 100, new Date().toISOString(), new Date().toISOString()]);

        res.json({ success: true, message: `Hired ${name} (Skill: ${skill})` });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/user/:telegramId/drivers/collect', async (req, res) => {
    try {
        const { driverId } = req.body;
        const user = await getUser(req.params.telegramId);
        const driver = await db.get('SELECT * FROM drivers WHERE id = ? AND user_id = ?', [driverId, user.id]);

        if (!driver) return res.status(404).json({ error: 'Driver not found' });

        const now = new Date();
        const last = new Date(driver.last_collection);
        const hours = Math.abs(now - last) / 36e5;

        if (hours < 1) return res.status(400).json({ error: 'Wait at least 1 hour' });

        const earnings = Math.floor(hours * (driver.skill * 10));

        user.balance += earnings;
        user.total_earned += earnings;
        await saveUser(user);

        await db.run('UPDATE drivers SET last_collection = ? WHERE id = ?', [now.toISOString(), driver.id]);

        res.json({ success: true, earnings, balance: user.balance });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/user/:telegramId/drivers/assign', async (req, res) => {
    try {
        const { driverId, carId } = req.body;
        const user = await getUser(req.params.telegramId);

        // Find driver
        const driver = await db.get('SELECT * FROM drivers WHERE id = ? AND user_id = ?', [driverId, user.id]);
        if (!driver) return res.status(404).json({ error: 'Driver not found' });

        if (driver.car_id === carId) {
            return res.status(400).json({ error: 'Car already assigned to this driver' });
        }

        // Find car ownership (including business fleet)
        const business = user.business || { fleet: [] };
        // Check if carId is a fleet instance OR an owned car model ID
        const fleetCar = (business.fleet || []).find(f => f.id === carId);
        const isInFleet = !!fleetCar;

        if (!user.owned_cars.includes(carId) && !isInFleet) {
            return res.status(403).json({ error: 'У вас нет этой машины или она не в автопарке' });
        }

        // Check if car assigned to another driver
        const otherDriver = await db.get('SELECT * FROM drivers WHERE car_id = ? AND id != ? AND user_id = ?', [carId, driverId, user.id]);
        if (otherDriver) {
            return res.status(400).json({ error: `Car is already driven by ${otherDriver.name}` });
        }

        // Update driver
        await db.run('UPDATE drivers SET car_id = ?, state = "working", last_collection = ? WHERE id = ?',
            [carId, new Date().toISOString(), driverId]);

        res.json({ success: true, message: `🚗 ${driver.name} is now driving ${carId}` });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============= v2.6: JACKPOT =============
app.get('/api/jackpot', async (req, res) => {
    try {
        const setting = await db.get('SELECT value FROM global_settings WHERE key = "jackpot_pool"');
        const jackpot = setting ? parseFloat(setting.value) : 0;

        const history = await db.query(`
            SELECT j.amount, j.won_at, u.telegram_id, u.car_data 
            FROM jackpot_history j 
            JOIN users u ON j.winner_id = u.id 
            ORDER BY j.won_at DESC LIMIT 5
        `);

        res.json({ current: jackpot, history });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/user/:telegramId/stats', async (req, res) => {
    try {
        const user = await getUser(req.params.telegramId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const nextPartner = PARTNERS.find(p =>
            p.requirements.rides > (user.rides_completed || 0)
        );

        const currentPartner = PARTNERS.find(p => p.id === user.partner_id);
        const weeklyCost = (currentPartner?.weekly_cost || 0) +
            (user.car.rent_price || 0);

        res.json({
            rides_completed: user.rides_completed,
            total_earned: Number(user.total_earned.toFixed(2)),
            rating: user.rating,
            efficiency: Number((user.total_earned / (user.rides_completed || 1)).toFixed(2)),
            weekly_costs: weeklyCost,
            next_partner: nextPartner,
            days_passed: user.days_passed,
            weeks_passed: user.weeks_passed,
            total_distance: Number(user.total_distance.toFixed(1))
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});


// FLEET: Rent out a car (Passive Income)
app.post('/api/user/:telegramId/fleet/rent-out', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const { carId } = req.body;

        const user = await getUser(telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (!user.owned_cars.includes(carId)) {
            return res.status(403).json({ error: 'Вы не владеете этой машиной' });
        }

        if (user.car_id === carId) {
            return res.status(400).json({ error: 'Нельзя сдать машину, на которой вы сейчас работаете' });
        }

        const business = user.business || { rented_cars: {} };
        if (business.rented_cars[carId]) {
            return res.status(400).json({ error: 'Машина уже сдана в аренду' });
        }

        // Add to rented cars
        business.rented_cars[carId] = {
            rented_at: new Date().toISOString(),
            total_income: 0
        };
        user.business = business;

        await saveUser(user);

        const carName = CARS[carId]?.name || 'Машина';
        res.json({
            success: true,
            message: `💼 ${carName} сдана в аренду. Доход будет начисляться еженедельно.`,
            business: user.business
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// FLEET: Recall a car
app.post('/api/user/:telegramId/fleet/recall', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const { carId } = req.body;

        const user = await getUser(telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const business = user.business || { rented_cars: {} };
        if (!business.rented_cars[carId]) {
            return res.status(400).json({ error: 'Эта машина не сдана в аренду' });
        }

        delete business.rented_cars[carId];
        user.business = business;

        await saveUser(user);

        res.json({
            success: true,
            message: `🔑 Машина возвращена в гараж.`,
            business: user.business
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});


// ============= v3.4: GAS STATION INVESTMENTS =============
app.get('/api/investments', async (req, res) => {
    try {
        const stations = await db.query('SELECT * FROM gas_stations');
        res.json(stations);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to load investments' });
    }
});

app.post('/api/investments/buy', async (req, res) => {
    try {
        const { telegramId, stationId } = req.body;
        const user = await getUser(telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const station = await db.get('SELECT * FROM gas_stations WHERE id = ?', [stationId]);
        if (!station) return res.status(404).json({ error: 'Station not found' });
        if (station.owner_id) return res.status(400).json({ error: 'Already owned' });

        if (user.balance < station.purchase_price) {
            return res.status(400).json({ error: 'Insufficient funds' });
        }

        user.balance -= station.purchase_price;
        await saveUser(user);
        await db.run('UPDATE gas_stations SET owner_id = ? WHERE id = ?', [telegramId, stationId]);

        logSocialActivity(`🏢 ${user.username || telegramId} купил АЗС "${station.name}"!`);
        res.json({ success: true, message: 'Поздравляем с покупкой!' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Purchase failed' });
    }
});

app.post('/api/investments/update-prices', async (req, res) => {
    try {
        const { telegramId, stationId, pricePetrol, priceGas } = req.body;
        const station = await db.get('SELECT * FROM gas_stations WHERE id = ?', [stationId]);

        if (!station) return res.status(404).json({ error: 'Station not found' });
        if (station.owner_id !== telegramId.toString()) {
            return res.status(403).json({ error: 'Not your station' });
        }

        if (pricePetrol < 5 || pricePetrol > 15 || priceGas < 2 || priceGas > 10) {
            return res.status(400).json({ error: 'Недопустимая цена' });
        }

        await db.run('UPDATE gas_stations SET price_petrol = ?, price_gas = ? WHERE id = ?', [pricePetrol, priceGas, stationId]);
        res.json({ success: true, message: 'Цены обновлены!' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Update failed' });
    }
});


// v2.4: Play Slots
app.post('/api/casino/slots', async (req, res) => {
    try {
        const { telegramId, bet } = req.body;
        const user = await getUser(telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (typeof bet !== 'number' || bet < 10) {
            return res.status(400).json({ error: 'Bet must be at least 10 PLN' });
        }

        if (user.balance < bet) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        resetCasinoSpins(user);

        if (user.casino_spins_today >= 10) {
            return res.status(400).json({ error: 'Daily spin limit reached (10/day)' });
        }

        const result = spinSlots(bet);
        user.balance -= bet;
        user.balance += result.winAmount;
        user.casino_spins_today++;

        user.casino_stats = user.casino_stats || { total_won: 0, total_lost: 0, spins: 0 };
        user.casino_stats.spins++;
        if (result.winAmount > bet) {
            user.casino_stats.total_won += (result.winAmount - bet);
        } else {
            user.casino_stats.total_lost += (bet - result.winAmount);
        }

        await saveUser(user);

        res.json({
            success: true,
            result,
            balance: user.balance,
            spins_left: 10 - user.casino_spins_today
        });
    } catch (error) {
        console.error('Error playing slots:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============= v3.3: LICENSE PLATES =============

// Get all plates owned by user
app.get('/api/user/:telegramId/plates', async (req, res) => {
    try {
        const lp = await db.query('SELECT * FROM license_plates WHERE owner_id = ?', [req.params.telegramId]);
        res.json({ success: true, plates: lp.map(p => ({ ...p, buffs: JSON.parse(p.buffs) })) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Roll a random plate (Cost: 50,000 PLN)
app.post('/api/user/:telegramId/plates/roll', async (req, res) => {
    try {
        const user = await getUser(req.params.telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const ROLL_COST = 50000;
        if (user.balance < ROLL_COST) return res.status(400).json({ error: 'Недостаточно денег (50,000 PLN)' });

        user.balance -= ROLL_COST;

        let plateNumber;
        let isUnique = false;
        let attempts = 0;

        // Find a unique plate number
        while (!isUnique && attempts < 10) {
            plateNumber = plates.generateRandomPlate();
            const existing = await db.get('SELECT plate_number FROM license_plates WHERE plate_number = ?', [plateNumber]);
            if (!existing) isUnique = true;
            attempts++;
        }

        if (!isUnique) return res.status(500).json({ error: 'Could not generate unique plate' });

        const rarity = plates.getRarity(plateNumber);
        const buffs = plates.getBuffs(rarity);

        await db.run(`INSERT INTO license_plates (plate_number, owner_id, rarity, buffs, created_at) VALUES (?, ?, ?, ?, ?)`,
            [plateNumber, user.telegram_id, rarity, JSON.stringify(buffs), new Date().toISOString()]);

        await saveUser(user);

        res.json({ success: true, plate: { plate_number: plateNumber, rarity, buffs }, balance: user.balance });

    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create custom plate (SlavIk-001 style)
app.post('/api/user/:telegramId/plates/create', async (req, res) => {
    try {
        const { text } = req.body;
        const user = await getUser(req.params.telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (!plates.validatePlate(text)) {
            return res.status(400).json({ error: 'Недопустимый формат номера. Используйте A-Z и 0-9, макс 10 симв.' });
        }

        const plateNumber = text.toUpperCase();
        const existing = await db.get('SELECT plate_number FROM license_plates WHERE plate_number = ?', [plateNumber]);
        if (existing) return res.status(400).json({ error: 'Этот номер уже занят другим игроком!' });

        const cost = plates.calculatePlatePrice(plateNumber);
        if (user.balance < cost) {
            return res.status(400).json({ error: `Недостаточно денег. Цена этого номера: ${cost.toLocaleString()} PLN` });
        }

        user.balance -= cost;
        const rarity = plates.getRarity(plateNumber);
        const buffs = plates.getBuffs(rarity);

        await db.run(`INSERT INTO license_plates (plate_number, owner_id, rarity, buffs, created_at) VALUES (?, ?, ?, ?, ?)`,
            [plateNumber, user.telegram_id, rarity, JSON.stringify(buffs), new Date().toISOString()]);

        await saveUser(user);

        res.json({ success: true, plate: { plate_number: plateNumber, rarity, buffs }, balance: user.balance });

    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Equip a plate to the current car
app.post('/api/user/:telegramId/plates/equip', async (req, res) => {
    try {
        const { plateNumber } = req.body;
        const user = await getUser(req.params.telegramId);

        const plate = await db.get('SELECT * FROM license_plates WHERE plate_number = ? AND owner_id = ?', [plateNumber, user.telegram_id]);
        if (!plate) return res.status(404).json({ error: 'Номер не найден или вы не владелец' });

        // Unequip current plate from this car ID if any
        await db.run('UPDATE license_plates SET is_equipped = 0, car_id = NULL WHERE owner_id = ? AND car_id = ?', [user.telegram_id, user.car_id]);

        // Equip new plate
        await db.run('UPDATE license_plates SET is_equipped = 1, car_id = ? WHERE plate_number = ?', [user.car_id, plateNumber]);

        // Update user's car_data JSON to include plate for easy rendering
        user.car.plate = {
            number: plate.plate_number,
            rarity: plate.rarity,
            buffs: JSON.parse(plate.buffs)
        };
        await saveUser(user);

        res.json({ success: true, plate: user.car.plate });

    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Marketplace: Get all plates for sale
app.get('/api/plates/market', async (req, res) => {
    try {
        const lp = await db.query('SELECT * FROM license_plates WHERE market_price IS NOT NULL');
        res.json({ success: true, plates: lp.map(p => ({ ...p, buffs: JSON.parse(p.buffs) })) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Marketplace: List a plate for sale
app.post('/api/user/:telegramId/plates/list', async (req, res) => {
    try {
        const { plateNumber, price } = req.body;
        const user = await getUser(req.params.telegramId);

        if (price < 1000) return res.status(400).json({ error: 'Минимальная цена продажи: 1000 PLN' });

        const plate = await db.get('SELECT * FROM license_plates WHERE plate_number = ? AND owner_id = ?', [plateNumber, user.telegram_id]);
        if (!plate) return res.status(404).json({ error: 'Номер не найден или вы не владелец' });

        if (plate.is_equipped) {
            return res.status(400).json({ error: 'Нельзя продать номер, который установлен на машину. Сначала снимите его.' });
        }

        await db.run('UPDATE license_plates SET market_price = ? WHERE plate_number = ?', [price, plateNumber]);

        res.json({ success: true, message: `Номер ${plateNumber} выставлен на продажу за ${price} PLN` });

    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Marketplace: Buy a plate
app.post('/api/user/:telegramId/plates/buy', async (req, res) => {
    try {
        const { plateNumber } = req.body;
        const buyer = await getUser(req.params.telegramId);
        if (!buyer) return res.status(404).json({ error: 'Buyer not found' });

        const plate = await db.get('SELECT * FROM license_plates WHERE plate_number = ?', [plateNumber]);
        if (!plate || plate.market_price === null) return res.status(404).json({ error: 'Этот номер не продается' });

        if (buyer.balance < plate.market_price) {
            return res.status(400).json({ error: 'Недостаточно денег для покупки' });
        }

        if (plate.owner_id === buyer.telegram_id) {
            return res.status(400).json({ error: 'Вы не можете купить свой собственный номер' });
        }

        const sellerId = plate.owner_id;
        const price = plate.market_price;
        const commission = Math.floor(price * 0.1); // 10% tax
        const netAmount = price - commission;

        // Transaction
        buyer.balance -= price;
        await saveUser(buyer);

        const seller = await getUser(sellerId);
        if (seller) {
            seller.balance += netAmount;
            await saveUser(seller);
        } else {
            // If seller offline, update DB directly
            await db.run('UPDATE users SET balance = balance + ? WHERE telegram_id = ?', [netAmount, sellerId]);
            invalidateUserCache(sellerId);
        }

        // Transfer ownership and clear market status
        await db.run('UPDATE license_plates SET owner_id = ?, market_price = NULL, is_equipped = 0, car_id = NULL WHERE plate_number = ?',
            [buyer.telegram_id, plateNumber]);

        res.json({ success: true, message: `Поздравляем! Вы купили номер ${plateNumber}`, balance: buyer.balance });

    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============= v2.4: Play Roulette
app.post('/api/casino/roulette', async (req, res) => {
    try {
        const { telegramId, bet } = req.body;
        const user = await getUser(telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (typeof bet !== 'number' || bet < 10) {
            return res.status(400).json({ error: 'Bet must be at least 10 PLN' });
        }

        if (user.balance < bet) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        resetCasinoSpins(user);

        if (user.casino_spins_today >= 10) {
            return res.status(400).json({ error: 'Daily spin limit reached (10/day)' });
        }

        const result = spinRoulette(bet);
        user.balance -= bet;
        user.balance += result.winAmount;
        user.casino_spins_today++;

        user.casino_stats = user.casino_stats || { total_won: 0, total_lost: 0, spins: 0 };
        user.casino_stats.spins++;
        if (result.winAmount > bet) {
            user.casino_stats.total_won += (result.winAmount - bet);
        } else {
            user.casino_stats.total_lost += (bet - result.winAmount);
        }

        await saveUser(user);

        res.json({
            success: true,
            result,
            balance: user.balance,
            spins_left: 10 - user.casino_spins_today
        });
    } catch (error) {
        console.error('Error playing roulette:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// v2.6: Crash Game (Полёт)
// Automated Crash Game Manager (v3.3)
let CRASH_STATE = {
    roundId: Date.now(),
    phase: 'betting', // 'betting', 'flying', 'crashed'
    multiplier: 1.0,
    crashPoint: 0,
    phaseEndTime: Date.now() + 10000, // 10s for first betting phase
    players: new Map(), // telegramId -> { bet, multiplier: 0, win: 0 }
    history: []
};

function runCrashCycle() {
    const now = Date.now();

    if (CRASH_STATE.phase === 'betting' && now >= CRASH_STATE.phaseEndTime) {
        // Start flying
        CRASH_STATE.phase = 'flying';
        CRASH_STATE.startTime = now;
        CRASH_STATE.multiplier = 1.0;
        // Pre-determine crash point
        const roll = Math.random();
        if (roll < 0.1) {
            CRASH_STATE.crashPoint = 1.0; // instant crash
        } else {
            CRASH_STATE.crashPoint = Math.max(1.1, Math.min(100, 0.99 / (Math.random() || 0.001)));
        }
        // Flight phase lasts until crash or max 55s from cycle start
        // But let's just use the crash point to determine timing
        // Time to crash (ms) = ln(crashPoint) / 0.06 * 1000 (just an example curve)
        const flightDuration = Math.log(CRASH_STATE.crashPoint) / 0.05 * 1000;
        CRASH_STATE.phaseEndTime = now + Math.min(45000, flightDuration);
        console.log(`🚀 Crash Flight started: Target x${CRASH_STATE.crashPoint.toFixed(2)}`);
    }
    else if (CRASH_STATE.phase === 'flying') {
        const elapsed = (now - CRASH_STATE.startTime) / 1000;
        CRASH_STATE.multiplier = Math.pow(Math.E, 0.05 * elapsed);

        if (now >= CRASH_STATE.phaseEndTime || CRASH_STATE.multiplier >= CRASH_STATE.crashPoint) {
            // CRASH!
            CRASH_STATE.phase = 'crashed';
            CRASH_STATE.multiplier = CRASH_STATE.crashPoint;
            CRASH_STATE.phaseEndTime = now + 5000; // 5s cooldown

            // Record in history
            CRASH_STATE.history.unshift({
                roundId: CRASH_STATE.roundId,
                crashPoint: CRASH_STATE.crashPoint
            });
            if (CRASH_STATE.history.length > 10) CRASH_STATE.history.pop();

            console.log(`💥 Crash ended at x${CRASH_STATE.multiplier.toFixed(2)}`);
        }
    }
    else if (CRASH_STATE.phase === 'crashed' && now >= CRASH_STATE.phaseEndTime) {
        // Reset for next round
        CRASH_STATE.roundId = Date.now();
        CRASH_STATE.phase = 'betting';
        CRASH_STATE.multiplier = 1.0;
        CRASH_STATE.phaseEndTime = now + 10000; // 10s betting
        CRASH_STATE.players.clear();
        console.log(`🔔 New Crash round starting (betting phase)`);
    }
}

// Run cycle every 100ms for responsiveness
setInterval(runCrashCycle, 100);

app.get('/api/casino/crash/status', (req, res) => {
    res.json({
        roundId: CRASH_STATE.roundId,
        phase: CRASH_STATE.phase,
        multiplier: Number(CRASH_STATE.multiplier.toFixed(2)),
        timeLeft: Math.max(0, CRASH_STATE.phaseEndTime - Date.now()),
        history: CRASH_STATE.history,
        bettingOpen: CRASH_STATE.phase === 'betting'
    });
});

app.post('/api/casino/crash/bet', async (req, res) => {
    try {
        const { telegramId, bet } = req.body;
        if (CRASH_STATE.phase !== 'betting') {
            return res.status(400).json({ error: 'Betting is closed for this round' });
        }
        if (CRASH_STATE.players.has(telegramId)) {
            return res.status(400).json({ error: 'Already in this round' });
        }

        const user = await getUser(telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (typeof bet !== 'number' || bet < 10) return res.status(400).json({ error: 'Min bet 10 PLN' });
        if (user.balance < bet) return res.status(400).json({ error: 'Insufficient balance' });

        resetCasinoSpins(user);
        if (user.casino_spins_today >= 10) {
            return res.status(400).json({ error: 'Daily limit reached (10/day)' });
        }

        user.balance -= bet;
        user.casino_spins_today++;
        user.casino_stats = user.casino_stats || { total_won: 0, total_lost: 0, spins: 0 };
        user.casino_stats.spins++;
        user.casino_stats.total_lost += bet;

        await saveUser(user);

        CRASH_STATE.players.set(telegramId, { bet, multiplier: 0, win: 0 });

        res.json({ success: true, balance: user.balance });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/casino/crash/cashout', async (req, res) => {
    try {
        const { telegramId } = req.body;
        const player = CRASH_STATE.players.get(telegramId);

        if (!player) return res.status(400).json({ error: 'Not in this round' });
        if (CRASH_STATE.phase !== 'flying') return res.status(400).json({ error: 'Round is not flying' });
        if (player.multiplier > 0) return res.status(400).json({ error: 'Already cashed out' });

        const currentMultiplier = CRASH_STATE.multiplier;
        const winAmount = Math.floor(player.bet * currentMultiplier);

        const user = await getUser(telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.balance += winAmount;
        user.casino_stats.total_won += (winAmount - player.bet);
        user.casino_stats.total_lost -= player.bet;

        await saveUser(user);

        player.multiplier = currentMultiplier;
        player.win = winAmount;

        res.json({
            success: true,
            winAmount,
            multiplier: Number(currentMultiplier.toFixed(2)),
            balance: user.balance
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============= v2.6: BUSINESS & FLEET ENDPOINTS =============

// Get available cars for purchase (fleet shop)
app.get('/api/cars', (req, res) => {
    const carList = Object.values(CARS).map(c => ({
        id: c.id,
        name: c.name,
        image: c.image,
        purchase_price: c.purchase_price,
        rent_price: c.rent_price,
        fuel_consumption: c.fuel_consumption,
        description: c.description,
        is_owned: c.is_owned
    }));
    res.json({ cars: carList });
});

// Redundant endpoints removed (consolidated above)

// ============= v2.6: SKILLS UPGRADE ENDPOINT =============
app.post('/api/user/:telegramId/skills/upgrade', async (req, res) => {
    try {
        const user = await getUser(req.params.telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const { skill } = req.body;
        const validSkills = ['charisma', 'mechanic', 'navigator'];
        if (!validSkills.includes(skill)) {
            return res.status(400).json({ error: 'Неизвестный навык' });
        }

        user.skills = user.skills || { charisma: 0, mechanic: 0, navigator: 0 };
        const currentLevel = user.skills[skill] || 0;
        if (currentLevel >= 5) {
            return res.status(400).json({ error: 'Навык уже на максимуме' });
        }

        const costs = [0, 500, 1500, 4500, 10000, 25000];
        const cost = costs[currentLevel + 1];

        if (user.balance < cost) {
            return res.status(400).json({ error: `Недостаточно средств (нужно ${cost} PLN)` });
        }

        user.balance -= cost;
        user.skills[skill] = currentLevel + 1;
        await saveUser(user);

        const skillNames = { charisma: 'Харизма', mechanic: 'Механик', navigator: 'Навигатор' };
        res.json({
            success: true,
            message: `⬆ ${skillNames[skill]} повышен до уровня ${currentLevel + 1}`,
            balance: user.balance,
            skills: user.skills
        });
    } catch (error) {
        console.error('Error upgrading skill:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// v2.4: Open Lootbox
app.post('/api/lootbox/open', async (req, res) => {
    try {
        const { telegramId, boxType } = req.body;
        const user = await getUser(telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.lootboxes = user.lootboxes || { wooden: 0, silver: 0, gold: 0, legendary: 0 };

        if (!user.lootboxes[boxType] || user.lootboxes[boxType] <= 0) {
            return res.status(400).json({ error: 'No lootbox of this type' });
        }

        const reward = openLootbox(boxType);
        if (!reward) {
            return res.status(500).json({ error: 'Failed to open lootbox' });
        }

        switch (reward.type) {
            case 'money':
                user.balance += reward.amount;
                break;
            case 'fuel':
                user.fuel = Math.min(user.max_fuel || 45, user.fuel + reward.amount);
                break;
            case 'stamina':
                user.stamina = Math.min(100, user.stamina + reward.amount);
                break;
            case 'car':
            case 'exclusive_car':
                if (reward.carId) {
                    user.owned_cars = user.owned_cars || [];
                    if (!user.owned_cars.includes(reward.carId)) {
                        user.owned_cars.push(reward.carId);
                    }
                }
                break;
            case 'upgrade':
                // Logic for upgrades can be added here
                break;
        }

        user.lootboxes[boxType]--;
        await saveUser(user);

        res.json({
            success: true,
            reward,
            balance: user.balance,
            fuel: user.fuel,
            stamina: user.stamina,
            lootboxes: user.lootboxes
        });
    } catch (error) {
        console.error('Error opening lootbox:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// v2.4: Get lootboxes
app.get('/api/lootbox/:telegramId', async (req, res) => {
    try {
        const user = await getUser(req.params.telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const newBoxes = checkLootboxMilestones(user);
        if (newBoxes.length > 0) {
            await saveUser(user);
        }

        res.json({
            lootboxes: user.lootboxes || { wooden: 0, silver: 0, gold: 0, legendary: 0 },
            newBoxes
        });
    } catch (error) {
        console.error('Error getting lootboxes:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const adminAuth = (req, res, next) => {
    const password = req.headers['x-admin-password'] || req.query.admin_password || req.query.password || req.query.p;
    if (password === ADMIN_PASSWORD) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// v3.1: Banning Middleware
const checkBanned = async (req, res, next) => {
    const telegramId = req.params.telegramId || req.body.telegramId || req.query.telegramId;
    if (telegramId && req.path.startsWith('/api/') && !req.path.startsWith('/api/admin')) {
        try {
            const row = await db.get('SELECT is_banned FROM users WHERE telegram_id = ?', [telegramId]);
            if (row && row.is_banned) {
                return res.status(403).json({ error: 'BANNED', message: 'Ваш аккаунт заблокирован администратором.' });
            }
        } catch (e) {
            console.error('Banned check error:', e);
        }
    }
    next();
};
app.use(checkBanned);

// v3.1 Advanced Admin Panel Endpoints

// Banning
app.post('/api/admin/user/:telegramId/ban', adminAuth, async (req, res) => {
    try {
        await db.run('UPDATE users SET is_banned = 1 WHERE telegram_id = ?', [req.params.telegramId]);
        invalidateUserCache(req.params.telegramId);
        res.json({ success: true, message: 'User banned' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/user/:telegramId/unban', adminAuth, async (req, res) => {
    try {
        await db.run('UPDATE users SET is_banned = 0 WHERE telegram_id = ?', [req.params.telegramId]);
        invalidateUserCache(req.params.telegramId);
        res.json({ success: true, message: 'User unbanned' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Global Configs
app.get('/api/admin/configs', adminAuth, async (req, res) => {
    try {
        const configs = await db.query('SELECT * FROM global_configs');
        res.json(configs);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// v3.3: Admin License Plates View
app.get('/api/admin/plates', adminAuth, async (req, res) => {
    try {
        const sql = `
            SELECT lp.*, u.username as owner_name 
            FROM license_plates lp
            LEFT JOIN users u ON lp.owner_id = u.telegram_id
            ORDER BY lp.created_at DESC
        `;
        const plates = await db.query(sql);
        res.json(plates);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// v3.3: Admin Jackpot View
app.get('/api/admin/jackpot', adminAuth, async (req, res) => {
    try {
        const setting = await db.get('SELECT value FROM global_settings WHERE key = "jackpot_pool"');
        const pool = setting ? parseFloat(setting.value) : 0;

        const history = await db.query(`
            SELECT j.amount, j.won_at, u.telegram_id 
            FROM jackpot_history j 
            LEFT JOIN users u ON j.winner_id = u.id 
            ORDER BY j.won_at DESC LIMIT 10
        `);

        res.json({ pool, history });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/configs', adminAuth, async (req, res) => {
    try {
        const { key, value } = req.body;
        await db.run('UPDATE global_configs SET value = ? WHERE key = ?', [value, key]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Car Definitions Management
app.get('/api/admin/cars', adminAuth, async (req, res) => {
    try {
        const cars = await db.query('SELECT * FROM car_definitions');
        res.json(cars);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// v3.1: Activities Log
app.get('/api/admin/activities', adminAuth, async (req, res) => {
    try {
        const activities = await db.query('SELECT * FROM user_activity ORDER BY timestamp DESC LIMIT 100');
        res.json(activities);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// v3.2: Support System
app.get('/api/admin/support', adminAuth, async (req, res) => {
    try {
        const messages = await db.query(`
            SELECT 
                m.id,
                m.user_id,
                m.user_id AS telegram_id,
                m.message,
                m.file_id,
                m.is_from_admin,
                m.sender_type,
                m.timestamp
            FROM support_messages m
            ORDER BY m.timestamp DESC 
            LIMIT 200
        `);
        res.json(messages);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/support/reply', adminAuth, async (req, res) => {
    try {
        const { telegramId, text } = req.body;
        if (!telegramId || !text) return res.status(400).json({ error: 'telegramId and text required' });

        // Save to DB (using telegramId as user_id for simplicity in support table)
        await db.run('INSERT INTO support_messages (user_id, message, is_from_admin) VALUES (?, ?, ?)',
            [telegramId, text, 1]);

        // Send via Bot
        const success = await sendNotification(telegramId, 'SUPPORT_REPLY', { text });

        res.json({ success, message: success ? 'Ответ отправлен' : 'Ошибка при отправке (проверьте логи бота)' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Proxy for Telegram images
app.get('/api/admin/support/media/:fileId', adminAuth, async (req, res) => {
    try {
        let { fileId } = req.params;
        // Strip common extensions if present in the URL (e.g. .jpg, .png)
        fileId = fileId.replace(/\.(jpg|jpeg|png|gif)$/i, '');

        const fileLink = await bot.telegram.getFileLink(fileId);

        https.get(fileLink, (response) => {
            if (response.statusCode !== 200) {
                return res.status(response.statusCode).end();
            }

            // Set headers for inline display and a friendly filename
            res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
            res.setHeader('Content-Disposition', 'inline; filename="support_image.jpg"');

            response.pipe(res);
        }).on('error', (e) => {
            console.error('Proxy error:', e);
            res.status(500).end();
        });
    } catch (e) {
        console.error('Error getting file link:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/cars', adminAuth, async (req, res) => {
    try {
        const car = req.body;
        await db.run(`INSERT INTO car_definitions (id, name, model, image, description, purchase_price, rent_price, tank_capacity, fuel_consumption, has_gas, gas_tank_capacity, gas_consumption, is_premium)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [car.id, car.name, car.model, car.image, car.description, car.purchase_price, car.rent_price, car.tank_capacity, car.fuel_consumption, car.has_gas ? 1 : 0, car.gas_tank_capacity || 0, car.gas_consumption || 0, car.is_premium ? 1 : 0]);
        await syncCarsFromDB();
        res.json({ success: true, message: 'Car added' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/cars/:id', adminAuth, async (req, res) => {
    try {
        const car = req.body;
        await db.run(`UPDATE car_definitions SET name=?, model=?, image=?, description=?, purchase_price=?, rent_price=?, tank_capacity=?, fuel_consumption=?, has_gas=?, gas_tank_capacity=?, gas_consumption=?, is_premium=? WHERE id=?`,
            [car.name, car.model, car.image, car.description, car.purchase_price, car.rent_price, car.tank_capacity, car.fuel_consumption, row.has_gas ? 1 : 0, car.gas_tank_capacity || 0, car.gas_consumption || 0, car.is_premium ? 1 : 0, req.params.id]);
        await syncCarsFromDB();
        res.json({ success: true, message: 'Car updated' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Analytics
app.get('/api/admin/analytics', adminAuth, async (req, res) => {
    try {
        const now = new Date();
        const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const registrations = await db.query(`
            SELECT SUBSTR(created_at, 1, 10) as date, COUNT(*) as count 
            FROM users 
            WHERE created_at >= ?
            GROUP BY date 
            ORDER BY date ASC
        `, [fourteenDaysAgo]);

        const rides = await db.query(`
            SELECT SUBSTR(completed_at, 1, 10) as date, COUNT(*) as count 
            FROM orders_history 
            WHERE completed_at >= ?
            GROUP BY date 
            ORDER BY date ASC
        `, [fourteenDaysAgo]);

        // DAU (Daily Active Users)
        const dau = await db.get('SELECT COUNT(DISTINCT telegram_id) as total FROM users WHERE last_login >= ?', [new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()]);

        // WAU (Weekly Active Users)
        const wau = await db.get('SELECT COUNT(DISTINCT telegram_id) as total FROM users WHERE last_login >= ?', [sevenDaysAgo]);

        // District Popularity
        const districts = await db.query(`
            SELECT district_id, COUNT(*) as count 
            FROM orders_history 
            WHERE district_id IS NOT NULL
            GROUP BY district_id 
            ORDER BY count DESC 
            LIMIT 5
        `);

        res.json({
            registrations,
            rides,
            dau: dau.total || 0,
            wau: wau.total || 0,
            districtPopularity: districts,
            summary: {
                totalEarned: (await db.get('SELECT SUM(total_earned) as total FROM users')).total || 0,
                totalRides: (await db.get('SELECT COUNT(*) as total FROM orders_history')).total || 0,
                activeUsers: dau.total || 0
            }
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
// Middleware and Auth definitions moved up

// v3.4: AI Diagnostic Endpoint
app.get('/api/admin/ai-test', adminAuth, async (req, res) => {
    try {
        const aiSupport = require('./ai-support');
        const testId = '799869557';
        const AI_KEY = process.env.GEMINI_API_KEY;

        // 1. Try to list models directly via HTTPS (most reliable diagnostic)
        const https = require('https');
        const listModels = () => new Promise((resolve) => {
            https.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${AI_KEY}`, (apiRes) => {
                let data = '';
                apiRes.on('data', chunk => data += chunk);
                apiRes.on('end', () => resolve(data));
            }).on('error', e => resolve(`Error: ${e.message}`));
        });

        const rawModelsList = await listModels();
        let parsedModels = [];
        try {
            const json = JSON.parse(rawModelsList);
            parsedModels = json.models ? json.models.map(m => m.name) : ["No models found in JSON"];
        } catch (e) {
            parsedModels = ["Failed to parse models list"];
        }

        // 2. Try the actual AI support function
        const aiResponse = await aiSupport.getAIResponse(testId, "У меня закончился бензин и я не знаю что делать, помоги");

        res.json({
            success: true,
            aiWorking: !!aiResponse,
            aiResponse: aiResponse || "SKIP / Error",
            availableModels: parsedModels,
            apiKeyPresent: !!AI_KEY,
            rawApiResponse: rawModelsList.substring(0, 1000) // First 1k for safety
        });

    } catch (e) {
        res.status(500).json({
            success: false,
            error: e.message,
            stack: e.stack,
            apiKeyPresent: !!process.env.GEMINI_API_KEY
        });
    }
});

// ============= v3.0: AUCTION ENDPOINTS =============

// Redundant auction endpoints removed. Using auction.js routes.

app.get('/api/admin/stats', adminAuth, async (req, res) => {
    try {
        const totalUsers = await db.get('SELECT COUNT(*) as count FROM users');
        const totalEarned = await db.get('SELECT SUM(total_earned) as sum FROM users');
        const totalRides = await db.get('SELECT SUM(rides_total) as sum FROM users');
        const totalBalance = await db.get('SELECT SUM(balance) as sum FROM users');

        res.json({
            totalUsers: totalUsers.count,
            totalEarned: (totalEarned.sum || 0).toFixed(2),
            totalRides: totalRides.sum || 0,
            totalBalance: (totalBalance.sum || 0).toFixed(2)
        });
    } catch (error) {
        console.error('Admin stats error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/users', adminAuth, async (req, res) => {
    try {
        const users = await db.query('SELECT * FROM users ORDER BY last_login DESC');
        // Parse JSON fields
        users.forEach(u => {
            u.car_data = u.car_data ? JSON.parse(u.car_data) : null;
            u.owned_cars_data = u.owned_cars_data ? JSON.parse(u.owned_cars_data) : [];
            u.lootboxes = u.lootboxes_data ? JSON.parse(u.lootboxes_data) : {};
        });
        res.json(users);
    } catch (error) {
        console.error('Admin users error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/update-user', adminAuth, async (req, res) => {
    try {
        const { telegramId, updates } = req.body;
        const user = await getUser(telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Apply specific updates
        if (updates.balance !== undefined) user.balance = parseFloat(updates.balance);
        if (updates.level !== undefined) user.level = parseInt(updates.level);
        if (updates.experience !== undefined) user.experience = parseInt(updates.experience);
        if (updates.fuel !== undefined) user.fuel = parseFloat(updates.fuel);
        if (updates.stamina !== undefined) user.stamina = parseInt(updates.stamina);

        if (updates.lootboxes !== undefined) {
            user.lootboxes = { ...user.lootboxes, ...updates.lootboxes };
        }

        await saveUser(user);
        res.json({ success: true, user });
    } catch (error) {
        console.error('Admin update user error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/reset-user', adminAuth, async (req, res) => {
    try {
        const { telegramId } = req.body;
        const user = await getUser(telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Reset to default values
        user.balance = 250;
        user.total_earned = 0;
        user.level = 1;
        user.experience = 0;
        user.fuel = 45;
        user.gas_fuel = 0;
        user.stamina = 100;
        user.rides_completed = 0;
        user.rides_total = 0;
        user.rides_today = 0;
        user.rides_streak = 0;
        user.night_rides = 0;
        user.total_distance = 0;
        user.days_passed = 0;
        user.week_days = 0;
        user.weeks_passed = 0;
        user.partner_id = 1;
        user.partner_contract_date = new Date().toISOString();

        // Reset car
        user.car_id = 'fabia_blue_rent';
        user.car = { ...CARS['fabia_blue_rent'], is_owned: false };
        user.owned_cars = ['fabia_blue_rent'];

        // Clear other data
        user.achievements = {};
        user.lootboxes = { wooden: 0, silver: 0, gold: 0, legendary: 0 };
        user.business = { rented_cars: {} };
        user.casino_stats = { total_won: 0, total_lost: 0, spins: 0 };
        user.casino_spins_today = 0;
        user.tutorial_completed = 0; // v2.9: Reset tutorial so it shows again

        await saveUser(user);
        res.json({ success: true, message: 'User progress reset significantly' });
    } catch (error) {
        console.error('Admin reset user error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// v2.5: Maintenance Toggle
app.post('/api/admin/maintenance', adminAuth, async (req, res) => {
    try {
        const { active } = req.body;
        MAINTENANCE_MODE = active;
        await db.run('INSERT OR REPLACE INTO global_settings (key, value) VALUES ("maintenance_mode", ?)', [active.toString()]);
        res.json({ success: true, maintenanceMode: MAINTENANCE_MODE });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// v2.5: Error Logs
app.get('/api/admin/logs', adminAuth, async (req, res) => {
    try {
        const logs = await db.query('SELECT * FROM logs ORDER BY id DESC LIMIT 50');
        res.json(logs);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// v3.3: Debug Info for Railway
app.get('/api/admin/debug-info', adminAuth, async (req, res) => {
    try {
        const userCount = await db.get('SELECT COUNT(*) as count FROM users');
        const logCount = await db.get('SELECT COUNT(*) as count FROM logs');
        const botTokenPresent = !!process.env.TELEGRAM_BOT_TOKEN;
        const uptime = process.uptime();

        res.json({
            success: true,
            database: {
                users: userCount.count,
                logs: logCount.count,
                path: process.env.DATABASE_PATH || 'default (backend/data/taxi.db)'
            },
            bot: {
                tokenPresent: botTokenPresent,
                tokenHidden: botTokenPresent ? (process.env.TELEGRAM_BOT_TOKEN.substring(0, 5) + '...') : 'NONE'
            },
            server: {
                uptime: Math.floor(uptime) + 's',
                node: process.version,
                env: process.env.NODE_ENV || 'development'
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// v2.5 Admin Mode Status
app.get('/api/admin/maintenance-status', adminAuth, (req, res) => {
    res.json({ maintenanceMode: MAINTENANCE_MODE });
});

app.post('/api/admin/logs/clear', adminAuth, async (req, res) => {
    try {
        await db.run('DELETE FROM logs');
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// v2.5: Promo Code Management
app.get('/api/admin/promo', adminAuth, async (req, res) => {
    try {
        const promos = await db.query('SELECT * FROM promo_codes ORDER BY id DESC');
        promos.forEach(p => p.reward = JSON.parse(p.reward));
        res.json(promos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/promo', adminAuth, async (req, res) => {
    try {
        const { code, reward, maxUses, expiresAt } = req.body;
        await db.run('INSERT INTO promo_codes (code, reward, max_uses, expires_at) VALUES (?, ?, ?, ?)',
            [code.toUpperCase(), JSON.stringify(reward), maxUses, expiresAt]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/promo/:id', adminAuth, async (req, res) => {
    try {
        await db.run('DELETE FROM promo_codes WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});


// v2.6: Announcements
app.get('/api/announcement', async (req, res) => {
    try {
        const setting = await db.get('SELECT value FROM global_settings WHERE key = "active_announcement"');
        if (!setting || !setting.value) return res.json({ active: false });
        res.json({ active: true, data: JSON.parse(setting.value) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/announcement', adminAuth, async (req, res) => {
    try {
        const { title, message, type, active } = req.body;
        const value = active ? JSON.stringify({ title, message, type, timestamp: new Date().toISOString() }) : '';

        const existing = await db.get('SELECT value FROM global_settings WHERE key = "active_announcement"');
        if (existing !== undefined) {
            await db.run('UPDATE global_settings SET value = ? WHERE key = "active_announcement"', [value]);
        } else {
            await db.run('INSERT INTO global_settings (key, value) VALUES ("active_announcement", ?)', [value]);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// v2.5: PUBLIC Promo Code Redemption
app.post('/api/promo/redeem', async (req, res) => {
    try {
        const { telegramId, code } = req.body;
        const normalizedCode = code.toUpperCase();

        const promo = await db.get('SELECT * FROM promo_codes WHERE code = ?', [normalizedCode]);
        if (!promo) return res.status(404).json({ error: 'Промокод не найден' });

        if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
            return res.status(400).json({ error: 'Срок действия промокода истек' });
        }

        if (promo.max_uses && promo.current_uses >= promo.max_uses) {
            return res.status(400).json({ error: 'Промокод больше не активен' });
        }

        const alreadyUsed = await db.get('SELECT id FROM promo_usages WHERE user_id = ? AND promo_id = ?', [telegramId, promo.id]);
        if (alreadyUsed) return res.status(400).json({ error: 'Вы уже активировали этот промокод' });

        // Success!
        // Success!
        console.log(`[Promo] Redeeming "${normalizedCode}" for Telegram ID: ${telegramId} (type: ${typeof telegramId})`);

        const user = await getUser(String(telegramId));
        if (!user) {
            console.warn(`[Promo] User not found for ID: ${telegramId}`);
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const oldBalance = user.balance;
        const reward = JSON.parse(promo.reward);

        if (reward.balance) user.balance += reward.balance;
        if (reward.lootboxes) {
            user.lootboxes = user.lootboxes || { wooden: 0, silver: 0, gold: 0, legendary: 0 };
            for (let type in reward.lootboxes) {
                user.lootboxes[type] = (user.lootboxes[type] || 0) + reward.lootboxes[type];
            }
        }

        console.log(`[Promo] User ${telegramId} balance: ${oldBalance} -> ${user.balance}`);

        await db.run('UPDATE promo_codes SET current_uses = current_uses + 1 WHERE id = ?', [promo.id]);
        await db.run('INSERT INTO promo_usages (user_id, promo_id, used_at) VALUES (?, ?, ?)',
            [String(telegramId), promo.id, new Date().toISOString()]);

        await saveUser(user);
        console.log(`[Promo] User ${telegramId} saved successfully.`);

        res.json({ success: true, reward, balance: user.balance });
    } catch (e) {
        console.error('Redeem error:', e);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// v3.3: Admin Broadcast Message
app.post('/api/admin/broadcast', adminAuth, async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: 'Message required' });

        // Log the start of the process immediately
        await db.run('INSERT INTO logs (level, message, timestamp) VALUES (?, ?, ?)',
            ['INFO', 'Admin initiated broadcast: ' + message.substring(0, 50) + '...', new Date().toISOString()]);

        // Fetch users in the background to avoid timeout
        db.query('SELECT telegram_id FROM users').then(async (users) => {
            let successCount = 0;
            let failCount = 0;

            console.log(`📣 Starting broadcast to ${users.length} users...`);
            await db.run('INSERT INTO logs (level, message, timestamp) VALUES (?, ?, ?)',
                ['INFO', `User query returned ${users.length} users`, new Date().toISOString()]);
            await db.run('INSERT INTO logs (level, message, timestamp) VALUES (?, ?, ?)',
                ['INFO', `Starting broadcast to ${users.length} users`, new Date().toISOString()]);

            if (users.length === 0) {
                await db.run('INSERT INTO logs (level, message, timestamp) VALUES (?, ?, ?)',
                    ['WARNING', 'Broadcast aborted: No users found in database', new Date().toISOString()]);
                return;
            }

            for (const user of users) {
                if (user.telegram_id) {
                    try {
                        const sent = await sendNotification(user.telegram_id, 'BROADCAST', { text: message });
                        if (sent) successCount++;
                        else failCount++;
                    } catch (e) {
                        failCount++;
                    }
                    // Small delay to prevent hitting Telegram rate limits too hard
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }

            console.log(`✅ Broadcast finished. Success: ${successCount}, Failed: ${failCount}`);

            // Log the broadcast event
            await logError('INFO', `Broadcast sent: ${successCount} success, ${failCount} fail`, message);
        }).catch(err => {
            console.error('Broadcast background error:', err);
        });

        // Return immediately to frontend
        res.json({ success: true, message: 'Рассылка запущена в фоновом режиме. Проверьте логи для статуса.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// v3.3: Global Settings (including Online Adjustment)
app.post('/api/admin/settings', adminAuth, async (req, res) => {
    try {
        const { key, value } = req.body;
        await db.run('INSERT OR REPLACE INTO global_settings (key, value) VALUES (?, ?)', [key, value]);
        res.json({ success: true, message: 'Setting updated' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/online-count', async (req, res) => {
    try {
        const base = Math.floor(Math.random() * 20) + 10;
        const offsetRow = await db.get('SELECT value FROM global_settings WHERE key = "online_offset"');
        const offset = offsetRow ? parseInt(offsetRow.value) || 0 : 0;
        res.json({ count: base + offset });
    } catch (e) {
        res.json({ count: 12 }); // Fallback
    }
});

// v3.3: Error Reporting from Client
app.post('/api/error-report', async (req, res) => {
    try {
        const { error, stack, telegramId, screen } = req.body;
        const message = `Client Error [${screen}]: ${error}`;
        await logError('ERROR', message, stack || '');
        console.error('🚫 Remote Client Error:', message);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============= 404 HANDLERS =============
// API 404 - Always return JSON
app.use('/api', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

// SPA 404 - Serve index.html for unknown frontend routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`\n🚖 TAXI SIMULATOR PRO`);
    console.log(`📡 Сервер запущен: http://localhost:${PORT}`);
    console.log(`\nv2.0 with SQLite Persistence `);
});
