const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const dynamicConfigs = [
    { key: 'earnings_multiplier', value: '1.0', category: 'Economy', description: 'Множитель заработка' },
    { key: 'experience_multiplier', value: '1.0', category: 'Economy', description: 'Множитель опыта' },
    { key: 'quest_chance', value: '0.15', category: 'Events', description: 'Шанс квеста (0.0 - 1.0)' },
    { key: 'police_fine_chance', value: '0.05', category: 'Events', description: 'Шанс штрафа полиции (0.0 - 1.0)' }
];

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS global_configs (
        key TEXT PRIMARY KEY,
        value TEXT,
        category TEXT,
        description TEXT
    )`);

    dynamicConfigs.forEach(cfg => {
        db.run(`INSERT OR IGNORE INTO global_configs(key, value, category, description) VALUES(?, ?, ?, ?)`,
            [cfg.key, cfg.value, cfg.category, cfg.description]);
    });
});

db.close(() => {
    console.log('Configs seeded.');
});
