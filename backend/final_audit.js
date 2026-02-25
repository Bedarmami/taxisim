const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'new.db');
const targetTelegramId = '1288177696';

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
    runAudit();
});

function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function runAudit() {
    try {
        console.log('--- Promo Codes in DB ---');
        const promos = await query('SELECT * FROM promo_codes');
        console.log(JSON.stringify(promos, null, 2));

        console.log('\n--- Market Listings ---');
        const market = await query('SELECT * FROM market_listings');
        console.log(JSON.stringify(market, null, 2));

        console.log('\n--- Database Tables ---');
        const tables = await query("SELECT name FROM sqlite_master WHERE type='table'");
        console.log(tables.map(t => t.name).join(', '));

        console.log('\n--- Top 5 Richest Users ---');
        const topUsers = await query('SELECT telegram_id, username, balance FROM users ORDER BY balance DESC LIMIT 5');
        console.log(JSON.stringify(topUsers, null, 2));

        console.log('\n--- Target User Progress Delta ---');
        const target = await query('SELECT telegram_id, balance, total_earned, rides_total, total_distance, car_id, car_data FROM users WHERE telegram_id = ?', [targetTelegramId]);
        console.log(JSON.stringify(target, null, 2));

        console.log('\n--- Business Assets (Stations & Plates) ---');
        const stations = await query('SELECT name, district_id, uncollected_revenue FROM gas_stations WHERE owner_id = ?', [targetTelegramId]);
        const plates = await query('SELECT plate_number, rarity, buffs FROM license_plates WHERE owner_id = ?', [targetTelegramId]);
        console.log('Stations:', JSON.stringify(stations, null, 2));
        console.log('Plates:', JSON.stringify(plates, null, 2));

        console.log('\n--- Fleet Activity ---');
        const drivers = await query('SELECT name, state, last_collection FROM drivers WHERE user_id = (SELECT id FROM users WHERE telegram_id = ?)', [targetTelegramId]);
        console.log(JSON.stringify(drivers, null, 2));

        console.log('\n--- System Logs ---');
        const logs = await query('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 50');
        console.log(JSON.stringify(logs, null, 2));

        console.log('\n--- Promo Usages ---');
        const promoUsages = await query('SELECT * FROM promo_usages WHERE user_id = (SELECT id FROM users WHERE telegram_id = ?)', [targetTelegramId]);
        console.log(JSON.stringify(promoUsages, null, 2));

        console.log('\n--- Jackpot History (Last 10) ---');
        const jackpots = await query('SELECT * FROM jackpot_history ORDER BY won_at DESC LIMIT 10');
        console.log(JSON.stringify(jackpots, null, 2));

        console.log('\n--- Full JSON Fields ---');
        const jsonFields = await query('SELECT lootboxes_data, achievements_data, business_data FROM users WHERE telegram_id = ?', [targetTelegramId]);
        console.log(JSON.stringify(jsonFields, null, 2));

        console.log('\n--- Support Messages ---');
        const support = await query('SELECT * FROM support_messages WHERE user_id = ? OR user_id = (SELECT id FROM users WHERE telegram_id = ?)', [targetTelegramId, targetTelegramId]);
        console.log(JSON.stringify(support, null, 2));

        console.log('\n--- Auction Bids/Wins ---');
        const auction = await query('SELECT * FROM users WHERE telegram_id = ?', [targetTelegramId]);
        if (auction.length > 0) {
            console.log('Pending Rewards:', auction[0].pending_auction_rewards);
        }

        db.close();
    } catch (err) {
        console.error('Audit Error:', err);
        db.close();
    }
}
