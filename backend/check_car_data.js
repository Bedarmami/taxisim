const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'data', 'taxi.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.all("SELECT id, name, image FROM car_definitions WHERE id IN ('prius_20', 'prius_30', 'camry', 'tesla_3')", [], (err, rows) => {
        if (err) {
            console.error(err.message);
            return;
        }
        console.table(rows);
    });
});

db.close();
