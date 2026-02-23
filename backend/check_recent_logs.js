const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'taxi.db');
const db = new sqlite3.Database(dbPath);

// Current time in UTC
const now = new Date();
const fifteenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();

console.log("Checking logs since:", fifteenMinsAgo);

db.all("SELECT * FROM logs WHERE timestamp > ? ORDER BY id DESC", [fifteenMinsAgo], (err, rows) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(JSON.stringify(rows, null, 2));
    db.close();
});
