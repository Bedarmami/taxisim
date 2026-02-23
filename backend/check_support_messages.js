const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'taxi.db');
const db = new sqlite3.Database(dbPath);

db.all('SELECT * FROM support_messages ORDER BY timestamp DESC LIMIT 10', (err, rows) => {
    if (err) {
        console.error('Error querying support_messages:', err.message);
    } else {
        console.log('Total messages in support_messages:', rows.length);
        rows.forEach(m => {
            console.log(`[${m.timestamp}] User: ${m.user_id}, Admin: ${m.is_from_admin}, Msg: ${m.message}`);
        });
    }
    db.close();
});
