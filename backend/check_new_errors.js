const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'taxi.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT * FROM logs ORDER BY id DESC LIMIT 5", (err, rows) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(JSON.stringify(rows, null, 2));
    db.close();
});
