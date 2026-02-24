const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'data', 'taxi.db');
const db = new sqlite3.Database(dbPath);

const updates = [
    { id: 'prius_20_rent', image: '/assets/cars/prius_20.png' },
    { id: 'prius_20', image: '/assets/cars/prius_20.png' },
    { id: 'prius_30', image: '/assets/cars/prius_30.png' },
    { id: 'camry', image: '/assets/cars/camry.png' },
    { id: 'tesla_3', image: '/assets/cars/tesla.png' }
];

db.serialize(() => {
    updates.forEach(update => {
        db.run('UPDATE car_definitions SET image = ? WHERE id = ?', [update.image, update.id], (err) => {
            if (err) console.error(`Error updating ${update.id}:`, err.message);
            else console.log(`Updated ${update.id} image path with leading slash.`);
        });
    });
});

db.close();
