const sqlite3 = require('./node_modules/sqlite3').verbose();
const fs = require('fs');

const dbs = [
    'C:/Users/Vlad/Desktop/bot_taxitelegram/taxi.db',
    'C:/Users/Vlad/Desktop/всё работает кроме данных об авто/taxi.db',
    'C:/Users/Vlad/Desktop/Рабочий отправка в лс/taxi.db',
    'C:/Users/Vlad/Desktop/Рабочий- отправка в группу и в лс/taxi.db',
    'backend/data/taxi.db'
];

async function scanDB(dbPath) {
    if (!fs.existsSync(dbPath)) return [];

    return new Promise((resolve) => {
        const db = new sqlite3.Database(dbPath);
        const ids = new Set();

        db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
            if (err || !tables) {
                db.close();
                resolve([]);
                return;
            }

            let pending = tables.length;
            if (pending === 0) {
                db.close();
                resolve([]);
                return;
            }

            tables.forEach(table => {
                db.all(`PRAGMA table_info(${table.name})`, (err, columns) => {
                    const idCol = columns?.find(c => c.name.toLowerCase().includes('id') || c.name.toLowerCase().includes('telegr'));

                    if (idCol) {
                        db.all(`SELECT DISTINCT ${idCol.name} FROM ${table.name}`, (err, rows) => {
                            if (rows) {
                                rows.forEach(r => {
                                    const val = String(r[idCol.name]);
                                    if (/^\d{7,15}$/.test(val)) ids.add(val);
                                });
                            }
                            pending--;
                            if (pending === 0) {
                                db.close();
                                resolve(Array.from(ids));
                            }
                        });
                    } else {
                        pending--;
                        if (pending === 0) {
                            db.close();
                            resolve(Array.from(ids));
                        }
                    }
                });
            });
        });
    });
}

async function main() {
    const allIds = new Set();
    for (const db of dbs) {
        const ids = await scanDB(db);
        console.log(`Found ${ids.length} unique IDs in ${db}`);
        ids.forEach(id => allIds.add(id));
    }
    console.log('\n--- TOTAL UNIQUE TELEGRAM IDs FOUND ---');
    console.log(Array.from(allIds).join(', '));
    console.log(`Total: ${allIds.size}`);
}

main();
