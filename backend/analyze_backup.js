const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'data', 'taxi_backup_2026-02-24.db');
const db = new sqlite3.Database(dbPath);

const targetTelegramId = '1288177696';

db.serialize(() => {
    // Get the internal user id first
    db.get("SELECT * FROM users WHERE telegram_id = ?", [targetTelegramId], (err, user) => {
        if (!user) { console.log('User not found'); return; }

        console.log('=== USER PROFILE ===');
        console.log(`Balance: ${user.balance} PLN`);
        console.log(`Level: ${user.level}, Rides completed: ${user.rides_completed}`);
        console.log(`Is Banned: ${user.is_banned}`);
        console.log(`Created: ${user.created_at}, Last login: ${user.last_login}`);

        // Parse owned cars 
        let ownedCars = [];
        try { ownedCars = JSON.parse(user.owned_cars_data || '[]'); } catch (e) { }
        console.log(`\nOwned Cars (${ownedCars.length}):`);
        ownedCars.forEach(c => console.log(`  - ${c.name || c.id} | price: ${c.purchase_price} | image: ${c.image}`));

        // Current car
        let carData = null;
        try { carData = JSON.parse(user.car_data || 'null'); } catch (e) { }
        if (carData) console.log(`\nCurrent Car: ${carData.name} (ID: ${carData.id})`);

        const userId = user.id;

        // Orders history
        db.all("SELECT * FROM orders_history WHERE user_id = ? ORDER BY completed_at DESC LIMIT 30", [userId], (err, orders) => {
            console.log(`\n=== ORDERS HISTORY (last 30) ===`);
            if (!orders || orders.length === 0) {
                console.log('No orders found.');
            } else {
                orders.forEach(o => console.log(`  ${o.completed_at} | +${o.price} PLN | dist: ${o.distance}km`));

                const totalFromOrders = orders.reduce((sum, o) => sum + o.price, 0);
                const avgOrder = totalFromOrders / orders.length;
                const maxOrder = Math.max(...orders.map(o => o.price));
                console.log(`\n  Total earned (last 30): ${totalFromOrders.toFixed(2)}`);
                console.log(`  Avg order: ${avgOrder.toFixed(2)}, Max order: ${maxOrder}`);

                // Check for impossible orders
                const suspicious = orders.filter(o => o.price > 1000 || (o.distance > 0 && o.price / o.distance > 500));
                if (suspicious.length > 0) {
                    console.log(`\n  ⚠️  SUSPICIOUS ORDERS (${suspicious.length}):`);
                    suspicious.forEach(o => console.log(`    ${o.completed_at} | ${o.price} PLN | ${o.distance}km | ratio: ${(o.price / Math.max(o.distance, 0.01)).toFixed(0)}`));
                }
            }
        });

        // All activity logs
        db.all("SELECT * FROM user_activity WHERE user_id = ? ORDER BY timestamp DESC LIMIT 50", [userId], (err, logs) => {
            if (err) console.error('activity error:', err.message);
            console.log(`\n=== ACTIVITY LOGS (last 50) ===`);
            if (!logs || logs.length === 0) {
                console.log('No activity logs found.');
            } else {
                logs.forEach(l => console.log(`  ${l.timestamp} | ${l.action} | ${l.details}`));
            }
        });

        // Casino history
        db.all("SELECT * FROM user_activity WHERE user_id = ? AND (action LIKE '%CRASH%' OR action LIKE '%CASINO%' OR action LIKE '%WIN%') ORDER BY timestamp DESC LIMIT 30", [userId], (err, casino) => {
            if (err) return;
            console.log(`\n=== CASINO ACTIVITY (last 30) ===`);
            if (!casino || casino.length === 0) {
                console.log('No casino logs.');
            } else {
                casino.forEach(l => console.log(`  ${l.timestamp} | ${l.action} | ${l.details}`));
            }
        });
    });
});

setTimeout(() => db.close(), 3000);
