const sqlite3 = require('./node_modules/sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const desktopPath = 'C:/Users/Vlad/Desktop';
const idRegex = /\b\d{7,12}\b/g;
const allIds = new Set();

async function scanFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    try {
        const stats = fs.statSync(filePath);
        if (stats.size > 2 * 1024 * 1024) return; // Skip files > 2MB

        const content = fs.readFileSync(filePath, 'utf8');
        const matches = content.match(idRegex);
        if (matches) {
            matches.forEach(id => {
                if (!id.startsWith('2026') && !id.startsWith('2025')) { // Filter out dates
                    allIds.add(id);
                }
            });
        }
    } catch (e) { }
}

async function scanDB(dbPath) {
    if (!fs.existsSync(dbPath)) return;
    return new Promise((resolve) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) return resolve();
        });

        db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
            if (err || !tables) {
                db.close();
                return resolve();
            }

            let pending = tables.length;
            if (pending === 0) {
                db.close();
                return resolve();
            }

            tables.forEach(table => {
                db.all(`SELECT * FROM ${table.name} LIMIT 1000`, (err, rows) => {
                    if (rows) {
                        const str = JSON.stringify(rows);
                        const matches = str.match(idRegex);
                        if (matches) matches.forEach(id => allIds.add(id));
                    }
                    pending--;
                    if (pending === 0) {
                        db.close();
                        resolve();
                    }
                });
            });
        });
    });
}

async function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        try {
            const stats = fs.statSync(fullPath);
            if (stats.isDirectory()) {
                if (!file.startsWith('.') && file !== 'node_modules') {
                    await walk(fullPath);
                }
            } else {
                const ext = path.extname(file).toLowerCase();
                if (ext === '.db') {
                    await scanDB(fullPath);
                } else if (['.txt', '.log', '.json', '.js', '.py'].includes(ext)) {
                    await scanFile(fullPath);
                }
            }
        } catch (e) { }
    }
}

async function main() {
    console.log('🔍 Starting deep scan of desktop for IDs...');
    // Only scan relevant folders to avoid massive delay
    const folders = [
        desktopPath + '/taxi-simulator',
        desktopPath + '/bot_taxitelegram',
        desktopPath + '/всё работает кроме данных об авто',
        desktopPath + '/Работающий',
        desktopPath + '/shopbot',
        desktopPath + '/Bot_Grok'
    ];

    for (const folder of folders) {
        if (fs.existsSync(folder)) {
            console.log(`Scanning ${folder}...`);
            await walk(folder);
        }
    }

    // Filter IDs (must not be too common or part of larger numbers)
    // Actually our regex \b\d{7,12}\b handles most.

    // Filter out some known large numbers or dates
    const result = Array.from(allIds).filter(id => {
        if (id.length < 9) return true; // Most TG IDs are 9-10 digits nowadays
        if (id.startsWith('202')) return false; // Date
        return true;
    });

    console.log('\n--- FOUND UNIQUE TELEGRAM IDs ---');
    console.log(result.join(', '));
    console.log(`\nTotal: ${result.size}`);
}

main();
