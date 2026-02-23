const sqlite3 = require('./node_modules/sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbs = [
    'C:/Users/Vlad/Desktop/bot_taxitelegram/taxi.db',
    'C:/Users/Vlad/Desktop/всё работает кроме данных об авто/taxi.db',
    'C:/Users/Vlad/Desktop/Работающий/taxi.db',
    'C:/Users/Vlad/Desktop/Рабочий отправка в лс/taxi.db',
    'C:/Users/Vlad/Desktop/Рабочий- отправка в группу и в лс/taxi.db',
    'C:/Users/Vlad/Desktop/Bot_Grok/shop.db',
    'C:/Users/Vlad/Desktop/shopbot/shop.db',
    'backend/data/taxi.db'
];

async function scanDB(dbPath) {
    if (!fs.existsSync(dbPath)) return [];

    return new Promise((resolve) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) return resolve([]);
        });

        db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
            if (err || !tables) {
                db.close();
                return resolve([]);
            }

            let results = [];
            let pending = tables.length;
            if (pending === 0) {
                db.close();
                return resolve([]);
            }

            tables.forEach(table => {
                db.all(`PRAGMA table_info("${table.name}")`, (err, columns) => {
                    const idCols = columns?.filter(c =>
                        ['id', 'telegram_id', 'user_id', 'client_id', 'driver_id', 'telegr'].some(key => c.name.toLowerCase().includes(key))
                    );

                    if (idCols && idCols.length > 0) {
                        const select = idCols.map(c => `"${c.name}"`).join(', ');
                        db.all(`SELECT ${select} FROM "${table.name}"`, (err, rows) => {
                            if (rows) {
                                rows.forEach(row => {
                                    Object.values(row).forEach(val => {
                                        const sVal = String(val);
                                        // Telegram IDs are typically 8-12 digits and don't look like versions or dates
                                        if (/^\d{8,12}$/.test(sVal) && !sVal.startsWith('202')) {
                                            results.push({ idText: sVal, source: `${path.basename(dbPath)} -> ${table.name}` });
                                        }
                                    });
                                });
                            }
                            pending--;
                            if (pending === 0) {
                                db.close();
                                resolve(results);
                            }
                        });
                    } else {
                        pending--;
                        if (pending === 0) {
                            db.close();
                            resolve(results);
                        }
                    }
                });
            });
        });
    });
}

async function main() {
    console.log('--- STARTING EXHAUSTIVE USER SCAN ---');
    let allRecords = [];
    for (const db of dbs) {
        console.log(`Scanning: ${db}...`);
        const records = await scanDB(db);
        allRecords = allRecords.concat(records);
    }

    // Deduplicate by ID
    const uniqueIds = new Map();
    allRecords.forEach(rec => {
        if (!uniqueIds.has(rec.idText)) {
            uniqueIds.set(rec.idText, rec.source);
        }
    });

    console.log('\n--- CONSOLIDATED RESULTS ---');
    const result = Array.from(uniqueIds.entries()).map(([id, source]) => ({ id, source }));
    console.log(JSON.stringify(result, null, 2));
    console.log(`\nFound ${result.length} unique potential Telegram IDs.`);
}

main();
