const express = require('express');
const router = express.Router();

// Города для генерации заказов
const locations = [
    "Рыночная площадь", "Железнодорожный вокзал", "Университет",
    "Торговый центр", "Аэропорт", "Старый город", "Парк культуры",
    "Больница", "Стадион", "Аквапарк", "Театр", "Музей",
    "Бизнес центр", "Озеро", "Горнолыжный курорт"
];

// Генерация случайных заказов
router.get('/', (req, res) => {
    const orders = [];
    const usedPairs = new Set();
    const numOrders = Math.floor(Math.random() * 5) + 3; // 3-8 заказов

    for (let i = 0; i < numOrders; i++) {
        let fromIndex, toIndex, pairKey;
        
        // Генерируем уникальные пары
        do {
            fromIndex = Math.floor(Math.random() * locations.length);
            toIndex = Math.floor(Math.random() * locations.length);
            pairKey = `${fromIndex}-${toIndex}`;
        } while (fromIndex === toIndex || usedPairs.has(pairKey));

        usedPairs.add(pairKey);

        const distance = (Math.random() * 15 + 1).toFixed(1); // 1-16 км
        const price = (distance * 3.5 + Math.random() * 5).toFixed(2); // Цена за км + случайная надбавка

        orders.push({
            id: i + 1,
            from: locations[fromIndex],
            to: locations[toIndex],
            distance: parseFloat(distance),
            price: parseFloat(price)
        });
    }

    res.json(orders);
});

module.exports = router;