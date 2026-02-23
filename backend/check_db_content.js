const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'taxi.db');
const db = new sqlite3.Database(dbPath);

const tables = ['car_definitions', 'global_configs', 'user_activity', 'users', 'orders_history'];

db.serialize(() => {
    tables.forEach(table => {
        db.all(`SELECT COUNT(*) as count FROM ${table}`, (err, rows) => {
            if (err) {
                console.error(`Error querying ${table}:`, err.message);
            } else {
                console.log(`${table} count: ${rows[0].count}`);
            }
            if (table === tables[tables.length - 1]) {
                db.close();
            }
        });
    });
});
