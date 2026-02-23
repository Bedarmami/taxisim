const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'taxi.db');
const db = new sqlite3.Database(dbPath);

const logId = 9;

db.get("SELECT * FROM logs WHERE id = ?", [logId], (err, row) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    if (row) {
        console.log("ID:", row.id);
        console.log("MESSAGE:", row.message);
        console.log("STACK:", row.stack);
    }
    db.close();
});
