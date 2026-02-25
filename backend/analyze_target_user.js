const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'new.db');
const targetTelegramId = '1288177696';

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
    console.log(`Connected to database: ${dbPath}`);
    runAnalysis();
});

function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function runAnalysis() {
    try {
        console.log('--- User Profile ---');
        const user = await query('SELECT * FROM users WHERE telegram_id = ?', [targetTelegramId]);
        console.log(JSON.stringify(user, null, 2));

        if (user.length > 0) {
            const userId = user[0].id;

            console.log('\n--- Recent Orders (Last 20) ---');
            const orders = await query('SELECT * FROM orders_history WHERE user_id = ? ORDER BY completed_at DESC LIMIT 20', [userId]);
            console.log(JSON.stringify(orders, null, 2));

            console.log('\n--- User Activity (Last 20) ---');
            const activity = await query('SELECT * FROM user_activity WHERE user_id = ? ORDER BY timestamp DESC LIMIT 20', [userId]);
            console.log(JSON.stringify(activity, null, 2));

            console.log('\n--- Promo Usages ---');
            const promos = await query('SELECT * FROM promo_usages WHERE user_id = ?', [userId]);
            console.log(JSON.stringify(promos, null, 2));

            console.log('\n--- Jackpot Wins ---');
            const jackpots = await query('SELECT * FROM jackpot_history WHERE winner_id = ?', [targetTelegramId]);
            console.log(JSON.stringify(jackpots, null, 2));

            console.log('\n--- Owned Gas Stations ---');
            const stations = await query('SELECT * FROM gas_stations WHERE owner_id = ?', [targetTelegramId]);
            console.log(JSON.stringify(stations, null, 2));

            console.log('\n--- Owned License Plates ---');
            const plates = await query('SELECT * FROM license_plates WHERE owner_id = ?', [targetTelegramId]);
            console.log(JSON.stringify(plates, null, 2));

            console.log('\n--- Hired Drivers ---');
            const drivers = await query('SELECT * FROM drivers WHERE user_id = ?', [userId]);
            console.log(JSON.stringify(drivers, null, 2));
        }

        db.close();
    } catch (err) {
        console.error('Error during analysis:', err.message);
        db.close();
    }
}
