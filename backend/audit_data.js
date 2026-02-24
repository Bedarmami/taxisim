const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'railway_dump.db');
const db = new sqlite3.Database(dbPath);

const query = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

async function audit() {
    try {
        console.log('--- ALL GAS STATION OWNERS ---');
        const rows = await query(`
            SELECT gs.id, gs.name, gs.owner_id, u.balance, u.rides_total, u.total_earned
            FROM gas_stations gs
            INNER JOIN users u ON gs.owner_id = u.telegram_id
        `);
        console.table(rows);

        console.log('\n--- SUSPICIOUS USERS (Balance > 100k and < 20 rides) ---');
        const suspicious = await query(`
            SELECT telegram_id, balance, rides_total, total_earned
            FROM users
            WHERE balance > 100000 AND rides_total < 20
        `);
        console.table(suspicious);

    } catch (e) {
        console.error(e);
    } finally {
        db.close();
    }
}

audit();
