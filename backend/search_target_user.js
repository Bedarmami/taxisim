const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'data', 'taxi.db');
const db = new sqlite3.Database(dbPath);

const searchTerm = '%kesh%';

db.serialize(() => {
    db.all("SELECT * FROM users WHERE username LIKE ? OR telegram_id LIKE ?", [searchTerm, searchTerm], (err, rows) => {
        if (err) {
            console.error(err.message);
            return;
        }
        console.log('Search results for:', searchTerm);
        console.table(rows.map(r => ({
            id: r.id,
            username: r.username,
            telegram_id: r.telegram_id,
            balance: r.balance,
            cars: JSON.parse(r.owned_cars_data || '[]').length
        })));
    });

    db.get("SELECT * FROM users WHERE telegram_id = '1288177696'", [], (err, row) => {
        if (row) {
            console.log('\nPreviously identified exploiter (1288177696):');
            console.log(`Balance: ${row.balance}, Cars: ${JSON.parse(row.owned_cars_data || '[]').length}`);
        } else {
            console.log('\nUser 1288177696 not found.');
        }
    });
});

db.close();
