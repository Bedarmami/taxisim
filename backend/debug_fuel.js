const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'taxi.db');
const db = new sqlite3.Database(dbPath);

console.log('--- CAR DEFINITIONS ---');
db.all(`SELECT id, name, fuel_consumption FROM car_definitions`, (err, rows) => {
    if (err) console.error(err);
    else console.table(rows);

    console.log('--- USER PARTNERS ---');
    db.all(`SELECT telegram_id, nickname, partner_id, fuel FROM users LIMIT 5`, (err, rows) => {
        if (err) console.error(err);
        else console.table(rows);
        db.close();
    });
});
