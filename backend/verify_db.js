const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'taxi.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.get('SELECT telegram_id FROM users LIMIT 1', (err, row) => {
        if (err) {
            console.error('Error:', err);
        } else if (row) {
            console.log('TELEGRAM_ID:', row.telegram_id);

            // Add a test reward
            const reward = [{
                type: 'car',
                id: 'prius_20',
                carName: '⚡ Toyota Prius 20 (Test)',
                carImage: '⚡',
                purchasePrice: 35000,
                sellPrice: 21000,
                bidAmount: 30000,
                wonAt: new Date().toISOString()
            }];

            db.run('UPDATE users SET pending_auction_rewards = ? WHERE telegram_id = ?',
                [JSON.stringify(reward), row.telegram_id], (updateErr) => {
                    if (updateErr) console.error('Update Error:', updateErr);
                    else console.log('Successfully added test reward to', row.telegram_id);
                    db.close();
                });
        } else {
            console.log('No users found in database.');
            db.close();
        }
    });
});
