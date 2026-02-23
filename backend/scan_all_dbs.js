const sqlite3 = require('./node_modules/sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbs = [
    'C:/Users/Vlad/Desktop/bot_taxitelegram/taxi.db',
    'C:/Users/Vlad/Desktop/всё работает кроме данных об авто/taxi.db',
    'C:/Users/Vlad/Desktop/Работающий/taxi.db',
    'C:/Users/Vlad/Desktop/Рабочий отправка в лс/taxi.db',
    'C:/Users/Vlad/Desktop/Рабочий- отправка в группу и в лс/taxi.db'
];

async function checkDB(dbPath) {
    if (!fs.existsSync(dbPath)) return;

    return new Promise((resolve) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.log(`Error opening ${dbPath}: ${err.message}`);
                resolve();
            }
        });

        db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
            if (err) {
                console.log(`Error listing tables in ${dbPath}: ${err.message}`);
                db.close();
                resolve();
                return;
            }

            console.log(`\n--- DB: ${dbPath} ---`);
            console.log('Tables:', tables.map(t => t.name).join(', '));

            // Try common user table names
            const userTable = tables.find(t => ['users', 'players', 'clients'].includes(t.name));
            if (userTable) {
                db.get(`SELECT COUNT(*) as count FROM ${userTable.name}`, (err, row) => {
                    console.log(`Users count in ${userTable.name}:`, row?.count || 0);
                    db.close();
                    resolve();
                });
            } else {
                db.close();
                resolve();
            }
        });
    });
}

async function main() {
    for (const db of dbs) {
        await checkDB(db);
    }
}

main();
