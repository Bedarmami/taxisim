const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'backend', 'data', 'taxi.db');
const db = new sqlite3.Database(dbPath);

console.log('Checking car_definitions table...');

db.all('SELECT id, name, is_autonomous FROM car_definitions', [], (err, rows) => {
    if (err) {
        console.error('Error querying car_definitions:', err.message);
    } else {
        console.log('Cars in database:');
        rows.forEach(row => {
            console.log(`- ${row.id}: ${row.name} (is_autonomous: ${row.is_autonomous})`);
        });
    }

    db.all('PRAGMA table_info(users)', [], (err, rows) => {
        if (err) {
            console.error('Error querying users table info:', err.message);
        } else {
            console.log('\nUsers table columns:');
            rows.forEach(row => {
                if (row.name.includes('autonomous')) {
                    console.log(`- ${row.name}`);
                }
            });
        }
        db.close();
    });
});
