const express = require('express');
const router = express.Router();

// Configuration constants (extracted from server.js)
const AGGREGATORS = {
    yodex: { id: 'yodex', name: '🚖 Yodex', baseMultiplier: 1.0, commission: 0.20, description: 'Эконом (много заказов)' },
    ubar: { id: 'ubar', name: '🖤 Ubar', baseMultiplier: 1.3, commission: 0.25, description: 'Комфорт (средне заказов)' },
    volt: { id: 'volt', name: '⚡ Volt', baseMultiplier: 1.6, commission: 0.30, description: 'Премиум (мало заказов)' }
};

const PARTNERS = [
    {
        id: 1,
        name: '👤 Начинающий',
        description: 'Делим 50/50, их машина, их топливо',
        revenue_split: 0.5,
        provides_car: true,
        fuel_provided: true,
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
    }
};

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

let currentEvent = null;

// Helpers
function isDistrictUnlocked(district, user) {
    if (district.unlocked) return true;
    if (district.unlockLevel && user.level < district.unlockLevel) return false;
    if (district.unlockCost && user.balance < district.unlockCost) return false;
    return true;
}

function startRandomEvent() {
    if (currentEvent) return;

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

        // Ensure cleanup
        setTimeout(() => {
            if (currentEvent && currentEvent.id === 'rush_hour') {
                console.log('⏰ Rush hour ended');
                currentEvent = null;
            }
        }, GLOBAL_EVENTS.rush_hour.duration);
    }
}

// Initialization
function initGame() {
    // Start random events every 2-4 hours
    setInterval(() => {
        if (Math.random() < 0.3) {
            startRandomEvent();
        }
    }, 2 * 60 * 60 * 1000);

    // Check rush hour every hour
    setInterval(checkRushHour, 60 * 60 * 1000);
    checkRushHour();
}

// Injected functions/state from server.js
let getUserFn;
function setDeps(getUser) {
    getUserFn = getUser;
}

// Routes
router.get('/districts/:telegramId', async (req, res) => {
    try {
        const user = await getUserFn(req.params.telegramId);
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

router.get('/current-event', (req, res) => {
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

module.exports = {
    router,
    initGame,
    setDeps,
    PARTNERS,
    DISTRICTS,
    AGGREGATORS,
    GLOBAL_EVENTS,
    getCurrentEvent: () => currentEvent
};
