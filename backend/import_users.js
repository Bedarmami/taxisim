const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Use the same DB path as db.js
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'taxi.db');
const importFilePath = path.join(__dirname, 'import_data.json');

if (!fs.existsSync(importFilePath)) {
    console.error(`❌ Error: ${importFilePath} not found!`);
    console.log('Please create import_data.json with user objects array.');
    process.exit(1);
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error opening database:', err.message);
        process.exit(1);
    }
    console.log('connected to database:', dbPath);
});

async function importUsers() {
    try {
        const rawData = fs.readFileSync(importFilePath, 'utf8');
        const users = JSON.parse(rawData);

        if (!Array.isArray(users)) {
            throw new Error('JSON data must be an array of user objects');
        }

        console.log(`📡 Found ${users.length} users to import...`);

        db.serialize(() => {
            const stmt = db.prepare(`
                INSERT OR IGNORE INTO users (
                    id, telegram_id, balance, total_earned, car_id, fuel, stamina, experience, level, rides_total, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            let success = 0;
            let skipped = 0;

            users.forEach(u => {
                // Ensure ID and Telegram ID exist
                const tid = String(u.telegram_id || u.telegramId || '');
                const uid = String(u.id || tid);

                if (!tid) {
                    skipped++;
                    return;
                }

                stmt.run(
                    uid,                        // id
                    tid,                        // telegram_id
                    u.balance || 1000,          // balance (default 1000)
                    u.total_earned || 0,        // total_earned
                    u.car_id || 'fabia_blue_rent', // car_id
                    u.fuel || 45.0,             // fuel
                    u.stamina || 100,           // stamina
                    u.experience || 0,          // experience
                    u.level || 1,               // level
                    u.rides_total || 0,         // rides_total
                    u.created_at || new Date().toISOString() // created_at
                );
                success++;
            });

            stmt.finalize(() => {
                console.log(`✅ Import finished!`);
                console.log(`📈 Success: ${success}`);
                console.log(`⚠️ Skipped: ${skipped}`);
                console.log(`💡 Note: Existing Telegram IDs were automatically skipped (no duplicates).`);
                db.close();
            });
        });

    } catch (e) {
        console.error('❌ Import failed:', e.message);
        db.close();
    }
}

importUsers();
