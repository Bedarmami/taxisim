const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('backend/data/taxi.db');

db.all("SELECT * FROM license_plates WHERE number IN ('01', 'BOSS', 'II-105-BU')", (err, rows) => {
    if (err) {
        console.error('Select error:', err);
        process.exit(1);
    }
    console.log('Found plates:', rows);

    if (rows.length > 0) {
        db.run("DELETE FROM license_plates WHERE number IN ('01', 'BOSS', 'II-105-BU')", (err) => {
            if (err) {
                console.error('Delete error:', err);
                process.exit(1);
            }
            console.log('Plates deleted successfully');
            db.close();
        });
    } else {
        console.log('No plates found to delete');
        db.close();
    }
});
