const express = require('express');
const router = express.Router();
const db = require('../db');

// Получение данных пользователя по telegram_id
router.get('/:telegramId', async (req, res) => {
    try {
        const { telegramId } = req.params;
        
        // Ищем пользователя
        let user = await db.query(
            `SELECT u.*, c.model, c.fuel_consumption, c.tank_capacity, c.rent_price 
             FROM users u 
             JOIN cars c ON u.car_id = c.id 
             WHERE u.telegram_id = $1`,
            [telegramId]
        );

        // Если пользователь не найден, создаем нового
        if (user.rows.length === 0) {
            const rentDate = new Date();
            rentDate.setDate(rentDate.getDate() + 7);

            const newUser = await db.query(
                `INSERT INTO users (telegram_id, rent_paid_until) 
                 VALUES ($1, $2) 
                 RETURNING *`,
                [telegramId, rentDate]
            );

            user = await db.query(
                `SELECT u.*, c.model, c.fuel_consumption, c.tank_capacity, c.rent_price 
                 FROM users u 
                 JOIN cars c ON u.car_id = c.id 
                 WHERE u.telegram_id = $1`,
                [telegramId]
            );
        }

        // Проверяем аренду
        const userData = user.rows[0];
        const now = new Date();
        const rentUntil = new Date(userData.rent_paid_until);

        if (now > rentUntil) {
            // Пытаемся списать аренду
            if (userData.balance >= userData.rent_price) {
                const newBalance = userData.balance - userData.rent_price;
                const newRentDate = new Date();
                newRentDate.setDate(newRentDate.getDate() + 7);

                await db.query(
                    'UPDATE users SET balance = $1, rent_paid_until = $2 WHERE id = $3',
                    [newBalance, newRentDate, userData.id]
                );

                userData.balance = newBalance;
                userData.rent_paid_until = newRentDate;
            } else {
                // Блокируем возможность брать заказы
                userData.rent_overdue = true;
            }
        }

        res.json({
            id: userData.id,
            balance: parseFloat(userData.balance),
            car: userData.model,
            fuel: parseFloat(userData.fuel_level),
            max_fuel: parseFloat(userData.tank_capacity),
            fuel_consumption: parseFloat(userData.fuel_consumption),
            rent_price: parseFloat(userData.rent_price),
            rent_paid_until: userData.rent_paid_until,
            rent_overdue: userData.rent_overdue || false
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Завершение заказа
router.post('/:telegramId/ride', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const { price, distance } = req.body;

        // Получаем данные пользователя
        const user = await db.query(
            `SELECT u.*, c.fuel_consumption 
             FROM users u 
             JOIN cars c ON u.car_id = c.id 
             WHERE u.telegram_id = $1`,
            [telegramId]
        );

        if (user.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userData = user.rows[0];
        
        // Рассчитываем расход топлива
        const fuelUsed = (userData.fuel_consumption / 100) * distance;

        // Проверяем достаточно ли топлива
        if (userData.fuel_level < fuelUsed) {
            return res.status(400).json({ error: 'Not enough fuel' });
        }

        // Обновляем данные
        const newFuel = userData.fuel_level - fuelUsed;
        const newBalance = parseFloat(userData.balance) + parseFloat(price);

        await db.query(
            'UPDATE users SET fuel_level = $1, balance = $2 WHERE id = $3',
            [newFuel, newBalance, userData.id]
        );

        res.json({
            success: true,
            new_balance: newBalance,
            new_fuel: newFuel,
            fuel_used: fuelUsed
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Заправка
router.post('/:telegramId/fuel', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const { liters } = req.body;

        const user = await db.query(
            `SELECT u.*, c.tank_capacity 
             FROM users u 
             JOIN cars c ON u.car_id = c.id 
             WHERE u.telegram_id = $1`,
            [telegramId]
        );

        if (user.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userData = user.rows[0];
        const pricePerLiter = 6.50;
        const cost = liters * pricePerLiter;

        // Проверяем достаточно ли денег
        if (userData.balance < cost) {
            return res.status(400).json({ error: 'Not enough money' });
        }

        // Проверяем не превышает ли лимит бака
        const newFuel = Math.min(userData.fuel_level + liters, userData.tank_capacity);
        const actualLiters = newFuel - userData.fuel_level;
        const actualCost = actualLiters * pricePerLiter;

        const newBalance = userData.balance - actualCost;

        await db.query(
            'UPDATE users SET fuel_level = $1, balance = $2 WHERE id = $3',
            [newFuel, newBalance, userData.id]
        );

        res.json({
            success: true,
            new_balance: newBalance,
            new_fuel: newFuel,
            liters_added: actualLiters,
            cost: actualCost
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;