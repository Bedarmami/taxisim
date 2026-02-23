const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'taxi.db');
const db = new sqlite3.Database(dbPath);

const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

db.all("SELECT id, message, timestamp FROM logs WHERE timestamp > ? ORDER BY id DESC", [thirtyMinsAgo], (err, rows) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log("Logs in last 30 mins:", rows.length);
    rows.slice(0, 10).forEach(r => {
        console.log(`[${r.timestamp}] ID:${r.id} - ${r.message}`);
    });
    db.close();
});
