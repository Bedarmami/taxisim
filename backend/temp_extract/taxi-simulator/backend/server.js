const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ============= ХРАНИЛИЩЕ ДАННЫХ =============
const users = new Map();
const ordersHistory = [];

// ============= ОПРЕДЕЛЕНИЕ ВСЕХ МАШИН =============
const CARS = {
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
        type: 'petrol'
    },
    fabia_gas: {
        id: 'fabia_gas',
        name: '🚗 Skoda Fabia (ГБО)',
        image: '🚗💨',
        fuel_consumption: 8.5,
        tank_capacity: 45,
        gas_tank_capacity: 40,
        purchase_price: 4000,
        rent_price: 0,
        has_gas: true,
        is_owned: true,
        gas_consumption: 9.5,
        description: 'Своя машина с ГБО, без еженедельной платы',
        type: 'dual'
    },
    prius_20_rent: {
        id: 'prius_20_rent',
        name: '⚡ Toyota Prius 20 (Аренда)',
        image: '⚡',
        fuel_consumption: 4.5,
        tank_capacity: 40,
        gas_tank_capacity: 0,
        purchase_price: 0,
        rent_price: 450,
        has_gas: false,
        is_owned: false,
        description: 'Экономичный гибрид',
        type: 'petrol'
    },
    prius_20: {
        id: 'prius_20',
        name: '⚡ Toyota Prius 20',
        image: '⚡',
        fuel_consumption: 4.5,
        tank_capacity: 40,
        gas_tank_capacity: 0,
        purchase_price: 15000,
        rent_price: 0,
        has_gas: false,
        is_owned: true,
        description: 'Экономичный гибрид в собственность',
        type: 'petrol'
    },
    prius_30: {
        id: 'prius_30',
        name: '⚡⚡ Toyota Prius 30',
        image: '⚡⚡',
        fuel_consumption: 4.2,
        tank_capacity: 43,
        gas_tank_capacity: 0,
        purchase_price: 25000,
        rent_price: 0,
        has_gas: false,
        is_owned: true,
        description: 'Улучшенный гибрид',
        type: 'petrol'
    },
    corolla_sedan: {
        id: 'corolla_sedan',
        name: '🚘 Toyota Corolla Sedan',
        image: '🚘',
        fuel_consumption: 6.5,
        tank_capacity: 50,
        gas_tank_capacity: 0,
        purchase_price: 35000,
        rent_price: 500,
        has_gas: false,
        is_owned: true,
        description: 'Надёжный седан',
        type: 'petrol'
    },
    camry: {
        id: 'camry',
        name: '🚙 Toyota Camry',
        image: '🚙',
        fuel_consumption: 7.0,
        tank_capacity: 60,
        gas_tank_capacity: 0,
        purchase_price: 50000,
        rent_price: 1000,
        has_gas: false,
        is_owned: true,
        description: 'Премиум автомобиль',
        type: 'petrol'
    }
};

// Машины для аренды и покупки
const RENTAL_CARS = Object.values(CARS).filter(car => car.rent_price > 0);
const PURCHASE_CARS = Object.values(CARS).filter(car => car.purchase_price > 0);

// ============= ПАРТНЁРЫ =============
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
    { name: "Рыночная площадь", type: "center", base_price: 1.0 },
    { name: "Железнодорожный вокзал", type: "station", base_price: 1.2 },
    { name: "Университет", type: "education", base_price: 0.9 },
    { name: "Торговый центр", type: "shopping", base_price: 1.1 },
    { name: "Аэропорт", type: "airport", base_price: 1.8 },
    { name: "Старый город", type: "tourist", base_price: 1.3 },
    { name: "Парк культуры", type: "park", base_price: 0.8 },
    { name: "Городская больница", type: "hospital", base_price: 1.0 },
    { name: "Промзона", type: "industrial", base_price: 1.4 },
    { name: "Ночной клуб", type: "night", base_price: 1.5 },
    { name: "Бизнес центр", type: "office", base_price: 1.3 }
];

// ============= СОЗДАНИЕ ПОЛЬЗОВАТЕЛЯ =============
function createNewUser(telegramId) {
    const now = new Date();
    
    return {
        id: Date.now(),
        telegram_id: telegramId,
        
        // Финансы
        balance: 250.00,
        total_earned: 0,
        
        // Машина
        car_id: 'fabia_blue_rent',
        car: CARS.fabia_blue_rent,
        owned_cars: ['fabia_blue_rent'],
        
        // Топливо
        fuel: 45.0,
        fuel_type: 'petrol',
        gas_fuel: 0,
        
        // Статистика
        hours_played: 0,
        session_start: now,
        last_login: now,
        rating: 0,
        rides_completed: 0,
        total_distance: 0,
        
        // Партнёр
        partner_id: 1,
        partner_contract_date: now,
        last_weekly_payment: now,
        
        // Характеристики
        stamina: 100,
        experience: 0,
        level: 1,
        
        // Счётчики
        rides_total: 0,
        rides_today: 0,
        rides_streak: 0,
        night_rides: 0,
        bonuses_received: 0,
        
        // ✅ НОВОЕ: Счётчики дней и недель
        days_passed: 0,
        week_days: 0,
        weeks_passed: 0,
        
        // Достижения
        achievements: {},
        unlocked_cars: ['fabia_blue_rent'],
        
        created_at: now
    };
}

// Создаём тестового пользователя
users.set('test_user_123', createNewUser('test_user_123'));

// ============= ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =============

function checkAchievements(user, context = {}) {
    const completed = [];
    const achievements = user.achievements || {};
    
    if (!achievements.first_ride && user.rides_total >= 1) {
        achievements.first_ride = { completed: true, date: new Date() };
        completed.push({ ...ACHIEVEMENTS.first_ride, reward: 50 });
        user.balance += 50;
    }
    
    if (!achievements.marathon && user.rides_streak >= 10) {
        achievements.marathon = { completed: true, date: new Date() };
        completed.push({ ...ACHIEVEMENTS.marathon, reward: 200 });
        user.balance += 200;
    }
    
    if (!achievements.night_rider && user.night_rides >= 5) {
        achievements.night_rider = { completed: true, date: new Date() };
        completed.push({ ...ACHIEVEMENTS.night_rider, reward: 150 });
        user.balance += 150;
    }
    
    if (!achievements.rich_taxi && user.total_earned >= 10000) {
        achievements.rich_taxi = { completed: true, date: new Date() };
        completed.push({ ...ACHIEVEMENTS.rich_taxi, reward: 500 });
        user.balance += 500;
    }
    
    if (!achievements.first_car && user.owned_cars.length > 1) {
        achievements.first_car = { completed: true, date: new Date() };
        completed.push({ ...ACHIEVEMENTS.first_car, reward: 100 });
        user.balance += 100;
    }
    
    user.achievements = achievements;
    return completed;
}

function getAvailablePartners(user) {
    return PARTNERS.filter(p => {
        if (p.id === user.partner_id) return false;
        return p.requirements.rides <= (user.rides_completed || 0);
    });
}

function generateOrder(user) {
    const from = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    let to;
    do { to = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)]; } 
    while (to === from);
    
    // Расстояние
    let distance = Math.random() * 20 + 2;
    if (from.type === 'airport' || to.type === 'airport') distance *= 1.5;
    if (from.type === 'center' && to.type === 'center') distance *= 0.7;
    
    // Базовая цена
    let basePrice = distance * 4.0;
    basePrice *= (from.base_price + to.base_price) / 2;
    
    // Бонус от партнёра
    const partner = PARTNERS.find(p => p.id === user.partner_id);
    if (partner?.bonus_orders) {
        basePrice *= partner.bonus_orders;
    }
    
    // Ночной тариф
    const hour = new Date().getHours();
    const isNight = hour >= 22 || hour <= 5;
    if (isNight) basePrice *= 1.3;
    
    // VIP заказы
    const isVip = partner?.vip_orders && Math.random() < 0.2;
    if (isVip) basePrice *= 2.0;
    
    return {
        id: Date.now() + Math.random(),
        from: from.name,
        to: to.name,
        distance: Number(distance.toFixed(1)),
        price: Number(basePrice.toFixed(2)),
        is_night: isNight,
        is_vip: isVip,
        time_limit: isVip ? 90 : 45,
        requirements: isVip ? { min_rating: 500 } : null
    };
}

// ============= API ENDPOINTS =============

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Server is running',
        users_count: users.size,
        timestamp: new Date() 
    });
});

// Получение данных пользователя
app.get('/api/user/:telegramId', (req, res) => {
    try {
        const { telegramId } = req.params;
        let user = users.get(telegramId);
        
        if (!user) {
            user = createNewUser(telegramId);
            users.set(telegramId, user);
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
            
            fuel: Number(user.fuel.toFixed(1)),
            max_fuel: user.car.tank_capacity,
            has_gas: user.car.has_gas || false,
            gas_fuel: Number(user.gas_fuel || 0).toFixed(1),
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
            
            // ✅ ИСПРАВЛЕНО: Добавлены поля дней и недель
            days_passed: user.days_passed || 0,
            week_days: user.week_days || 0,
            weeks_passed: user.weeks_passed || 0,
            
            achievements: user.achievements || {}
        });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Получение заказов
app.get('/api/orders/:telegramId', (req, res) => {
    try {
        const user = users.get(req.params.telegramId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const orders = [];
        const numOrders = Math.floor(Math.random() * 5) + 3;
        
        for (let i = 0; i < numOrders; i++) {
            orders.push(generateOrder(user));
        }
        
        res.json(orders);
        
    } catch (error) {
        console.error('Error generating orders:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Выполнение заказа
app.post('/api/user/:telegramId/ride', (req, res) => {
    try {
        const { telegramId } = req.params;
        const { order, useGas } = req.body;
        
        const user = users.get(telegramId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
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
        if (fuelType === 'gas') {
            if (user.gas_fuel < fuelNeeded) {
                return res.status(400).json({ error: 'Недостаточно газа' });
            }
            user.gas_fuel -= fuelNeeded;
        } else {
            if (user.fuel < fuelNeeded) {
                return res.status(400).json({ error: 'Недостаточно топлива' });
            }
            user.fuel -= fuelNeeded;
        }
        
        // Расчет дохода с учётом партнёра
        const partner = PARTNERS.find(p => p.id === user.partner_id);
        let earnings = order.price;
        
        if (partner) {
            earnings *= (1 - partner.revenue_split);
        }
        
        // Случайное событие
        let event = null;
        if (Math.random() < 0.2) {
            event = EVENTS[Math.floor(Math.random() * EVENTS.length)];
            if (event.type === 'bonus' || event.type === 'penalty') {
                event.effect(user);
            }
            if (event.type === 'bonus') {
                user.bonuses_received++;
            }
        }
        
        // Обновление статистики
        user.balance += earnings;
        user.total_earned += earnings;
        user.rides_completed++;
        user.rides_total++;
        user.rides_today++;
        user.rides_streak++;
        user.rating += Math.floor(order.distance);
        user.stamina = Math.max(0, user.stamina - 8);
        user.experience += Math.floor(order.distance);
        user.total_distance += order.distance;
        
        if (order.is_night) {
            user.night_rides++;
        }
        
        // Проверка уровня
        const newLevel = Math.floor(user.experience / 100) + 1;
        if (newLevel > user.level) {
            user.level = newLevel;
            user.stamina = 100;
        }
        
        // Проверка достижений
        const newAchievements = checkAchievements(user);
        
        // Сохраняем в историю
        ordersHistory.push({
            user_id: user.id,
            price: earnings,
            distance: order.distance,
            fuel_used: fuelNeeded,
            fuel_type: fuelType,
            completed_at: new Date()
        });
        
        res.json({
            success: true,
            new_balance: Number(user.balance.toFixed(2)),
            new_fuel: Number(user.fuel.toFixed(1)),
            new_gas_fuel: Number(user.gas_fuel || 0).toFixed(1),
            earnings: Number(earnings.toFixed(2)),
            fuel_used: Number(fuelNeeded.toFixed(1)),
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
            new_achievements: newAchievements
        });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ✅ НОВЫЙ УЛУЧШЕННЫЙ ENDPOINT ОТДЫХА С СЧЁТЧИКОМ ДНЕЙ
app.post('/api/user/:telegramId/rest', (req, res) => {
    try {
        const { telegramId } = req.params;
        const user = users.get(telegramId);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // ✅ Счётчики дней и недель
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
                    console.log(`💰 Снята плата партнёру: ${partner.weekly_cost} PLN`);
                } else {
                    not_enough_money = true;
                    console.log(`❌ Недостаточно средств для платежа партнёру`);
                }
            }

            // Проверяем аренду машины (если есть)
            if (user.car && user.car.rent_price && user.car.rent_price > 0 && !user.car.is_owned) {
                if (user.balance >= user.car.rent_price) {
                    user.balance -= user.car.rent_price;
                    rent_paid = true;
                    rent_amount += user.car.rent_price;
                    console.log(`🚗 Снята плата за аренду машины: ${user.car.rent_price} PLN`);
                } else {
                    not_enough_money = true;
                    console.log(`❌ Недостаточно средств для аренды машины`);
                    // Забираем машину и возвращаем на стартовую
                    user.car_id = 'fabia_blue_rent';
                    user.car = CARS.fabia_blue_rent;
                }
            }
        }

        // Восстанавливаем выносливость
        user.stamina = Math.min(100, (user.stamina || 0) + 30);
        user.rides_streak = 0;

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
app.post('/api/user/:telegramId/fuel', (req, res) => {
    try {
        const { telegramId } = req.params;
        const { liters, type } = req.body;
        
        console.log('🔥 ЗАПРАВКА: запрос получен', { telegramId, liters, type });

        const user = users.get(telegramId);
        if (!user) {
            console.log('❌ Пользователь не найден');
            return res.status(404).json({ error: 'User not found' });
        }

        if (type === 'gas' && !user.car.has_gas) {
            console.log('❌ Нет ГБО');
            return res.status(400).json({ error: 'У этой машины нет ГБО' });
        }

        const petrolPrice = 6.80;
        const gasPrice = 3.60;
        
        const requestedLiters = Math.max(1, Math.round(liters));
        console.log('Запрошено литров:', requestedLiters);
        
        let pricePerLiter, maxFuel, currentFuel;
        
        if (type === 'gas' && user.car.has_gas) {
            pricePerLiter = gasPrice;
            maxFuel = user.car.gas_tank_capacity || 40;
            currentFuel = user.gas_fuel || 0;
            console.log('⛽ ГАЗ: цена', pricePerLiter, 'макс бак', maxFuel, 'сейчас', currentFuel);
        } else {
            pricePerLiter = petrolPrice;
            maxFuel = user.car.tank_capacity;
            currentFuel = user.fuel;
            console.log('⛽ БЕНЗИН: цена', pricePerLiter, 'макс бак', maxFuel, 'сейчас', currentFuel);
        }

        const maxPossibleLiters = Number((maxFuel - currentFuel).toFixed(1));
        console.log('📊 Можно залить максимум:', maxPossibleLiters);
        
        if (maxPossibleLiters <= 0) {
            console.log('❌ Бак уже полный');
            return res.status(400).json({ error: 'Бак уже полный' });
        }

        const actualLiters = Math.min(requestedLiters, maxPossibleLiters);
        const actualLitersRounded = Number(actualLiters.toFixed(1));
        const cost = Number((actualLitersRounded * pricePerLiter).toFixed(2));

        console.log('💰 Стоимость:', cost, 'при балансе', user.balance);

        if (user.balance < cost) {
            console.log('❌ Недостаточно средств');
            return res.status(400).json({ error: 'Недостаточно средств' });
        }

        if (type === 'gas') {
            user.gas_fuel = Number((currentFuel + actualLitersRounded).toFixed(1));
            console.log('✅ Новый уровень газа:', user.gas_fuel);
        } else {
            user.fuel = Number((currentFuel + actualLitersRounded).toFixed(1));
            console.log('✅ Новый уровень бензина:', user.fuel);
        }
        user.balance = Number((user.balance - cost).toFixed(2));

        console.log('✅ ЗАПРАВКА УСПЕШНА!');

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
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
});

// Смена партнёра
app.post('/api/user/:telegramId/partner', (req, res) => {
    try {
        const { telegramId } = req.params;
        const { partnerId } = req.body;
        
        console.log('Смена партнёра:', { telegramId, partnerId });
        
        const user = users.get(telegramId);
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
        user.partner_contract_date = new Date();
        
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
app.post('/api/user/:telegramId/buy-car', (req, res) => {
    try {
        const { telegramId } = req.params;
        const { carId } = req.body;
        
        const user = users.get(telegramId);
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
        user.owned_cars.push(carId);
        
        user.fuel = car.tank_capacity;
        if (car.has_gas) {
            user.gas_fuel = car.gas_tank_capacity;
        }
        
        // Проверяем достижение
        const achievements = checkAchievements(user);
        
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
app.post('/api/user/:telegramId/rent-car', (req, res) => {
    try {
        const { telegramId } = req.params;
        const { carId } = req.body;
        
        const user = users.get(telegramId);
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
        
        user.fuel = car.tank_capacity;
        
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

// Получение доступных машин
app.get('/api/user/:telegramId/available-cars', (req, res) => {
    try {
        const user = users.get(req.params.telegramId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const allCars = Object.values(CARS);
        const availableCars = allCars.filter(car => !user.owned_cars.includes(car.id));
        
        res.json(availableCars);
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Получение статистики
app.get('/api/user/:telegramId/stats', (req, res) => {
    try {
        const user = users.get(req.params.telegramId);
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

// Запуск сервера
app.listen(PORT, () => {
    console.log(`\n🚖 TAXI SIMULATOR PRO`);
    console.log(`📡 Сервер запущен: http://localhost:${PORT}`);
    console.log(`\n💰 Стартовый баланс: 250 PLN`);
    console.log(`🚗 Начальная машина: Skoda Fabia (Аренда)`);
    console.log(`🤝 Начальный партнёр: Начинающий`);
    console.log(`\n📊 Счётчик дней: 0`);
    console.log(`📅 Счётчик недель: 0`);
    console.log(`\n✅ Каждый отдых = +1 день`);
    console.log(`✅ Каждые 7 дней = снятие платежей за аренду`);
    console.log(`\n⏱️  Сервер готов к работе!\n`);
});