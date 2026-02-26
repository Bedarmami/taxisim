const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'taxi.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // Performance: Enable WAL mode and optimize pragmas
        db.run('PRAGMA journal_mode = WAL');
        db.run('PRAGMA synchronous = NORMAL');
        db.run('PRAGMA cache_size = -20000'); // 20MB cache
        db.run('PRAGMA temp_store = MEMORY');
    }
});

let dbReadyResolve;
const dbReady = new Promise((resolve) => {
    dbReadyResolve = resolve;
});

function initDB() {
    return new Promise((resolve) => {
        db.serialize(() => {
            // Users table
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                telegram_id TEXT UNIQUE,
                balance REAL DEFAULT 0,
                total_earned REAL DEFAULT 0,
                
                car_id TEXT,
                car_data TEXT, -- JSON string
                owned_cars_data TEXT, -- JSON string
                
                fuel REAL DEFAULT 45.0,
                gas_fuel REAL DEFAULT 0,
                
                partner_id INTEGER DEFAULT 1,
                partner_contract_date TEXT,
                
                stamina INTEGER DEFAULT 100,
                experience INTEGER DEFAULT 0,
                level INTEGER DEFAULT 1,
                rating INTEGER DEFAULT 0,
                
                rides_completed INTEGER DEFAULT 0,
                rides_total INTEGER DEFAULT 0,
                rides_today INTEGER DEFAULT 0,
                rides_streak INTEGER DEFAULT 0,
                night_rides INTEGER DEFAULT 0,
                total_distance REAL DEFAULT 0,
                is_banned INTEGER DEFAULT 0, -- 0 for normal, 1 for banned
                
                days_passed INTEGER DEFAULT 0,
                week_days INTEGER DEFAULT 0,
                weeks_passed INTEGER DEFAULT 0,
                
                business_data TEXT, -- JSON string for rented cars
                
                achievements_data TEXT, -- JSON string
                last_daily_bonus TEXT, -- ISO Date string
                created_at TEXT,
                last_login TEXT,
                free_plate_rolls INTEGER DEFAULT 0,
                username TEXT,
                current_district TEXT DEFAULT 'suburbs',
                uncollected_fleet_revenue REAL DEFAULT 0,
                mileage REAL DEFAULT 0
            )`);

            // Orders history table
            db.run(`CREATE TABLE IF NOT EXISTS orders_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                car_id TEXT,
                price REAL,
                distance REAL,
                fuel_used REAL,
                fuel_type TEXT,
                completed_at TEXT,
                district_id TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`);

            // v3.6: Car Profitability Matrix - Add car_id to orders_history
            db.run(`ALTER TABLE orders_history ADD COLUMN car_id TEXT`, (err) => {
                // Ignore duplicate column errors
            });

            console.log('Database tables initialized.');

            const migrations = [
                `ALTER TABLE users ADD COLUMN last_daily_bonus TEXT`,
                `ALTER TABLE users ADD COLUMN mileage REAL DEFAULT 0`,
                `ALTER TABLE users ADD COLUMN last_stamina_update TEXT`,
                `ALTER TABLE users ADD COLUMN login_streak INTEGER DEFAULT 0`,
                `ALTER TABLE users ADD COLUMN last_login_date TEXT`,
                `ALTER TABLE users ADD COLUMN lootboxes_data TEXT DEFAULT '{}'`,
                `ALTER TABLE users ADD COLUMN lootboxes_given_data TEXT DEFAULT '{}'`,
                `ALTER TABLE users ADD COLUMN casino_spins_today INTEGER DEFAULT 0`,
                `ALTER TABLE users ADD COLUMN casino_last_reset TEXT`,
                `ALTER TABLE users ADD COLUMN casino_stats TEXT DEFAULT '{}'`,
                `ALTER TABLE users ADD COLUMN tutorial_completed INTEGER DEFAULT 0`,
                `ALTER TABLE users ADD COLUMN pending_auction_rewards TEXT DEFAULT '[]'`,
                `ALTER TABLE users ADD COLUMN free_plate_rolls INTEGER DEFAULT 0`,
                `ALTER TABLE users ADD COLUMN username TEXT`,
                `ALTER TABLE users ADD COLUMN current_district TEXT DEFAULT 'suburbs'`,
                `ALTER TABLE users ADD COLUMN uncollected_fleet_revenue REAL DEFAULT 0`,
                `ALTER TABLE users ADD COLUMN is_autonomous_active INTEGER DEFAULT 0`,
                `ALTER TABLE users ADD COLUMN paid_rests_today INTEGER DEFAULT 0`,
                `ALTER TABLE users ADD COLUMN last_autonomous_update TEXT`,
                `ALTER TABLE support_messages ADD COLUMN sender_type TEXT DEFAULT 'user'`,
                `ALTER TABLE car_definitions ADD COLUMN has_autopilot INTEGER DEFAULT 0`,
                `ALTER TABLE car_definitions ADD COLUMN is_autonomous INTEGER DEFAULT 0`,
                `ALTER TABLE jackpot_history ADD COLUMN winner_id TEXT`,
                `ALTER TABLE users ADD COLUMN skills TEXT DEFAULT '{"charisma":0,"mechanic":0,"navigator":0}'`,
                `ALTER TABLE users ADD COLUMN cleanliness REAL DEFAULT 100.0`,
                `ALTER TABLE users ADD COLUMN tire_condition REAL DEFAULT 100.0`,
                `ALTER TABLE orders_history ADD COLUMN district_id TEXT`,
                `ALTER TABLE gas_stations ADD COLUMN price_petrol REAL DEFAULT 6.80`,
                `ALTER TABLE gas_stations ADD COLUMN price_gas REAL DEFAULT 3.60`,
                `ALTER TABLE gas_stations ADD COLUMN fuel_stock REAL DEFAULT 0`,
                `ALTER TABLE gas_stations ADD COLUMN uncollected_revenue REAL DEFAULT 0`
            ];

            migrations.forEach(sql => {
                db.run(sql, (err) => {
                    if (err && !err.message.includes('duplicate column name')) {
                        console.error(`Migration error (${sql}):`, err.message);
                    }
                });
            });

            // Update existing rows for support_messages sender_type if migration was successful
            db.run(`UPDATE support_messages SET sender_type = 'admin' WHERE is_from_admin = 1 AND sender_type = 'user'`);
            db.run(`UPDATE support_messages SET sender_type = 'user' WHERE is_from_admin = 0 AND sender_type = 'user'`);


            // v2.5 Admin Expansion Tables
            db.run(`CREATE TABLE IF NOT EXISTS promo_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE,
                reward TEXT, -- JSON string
                max_uses INTEGER,
                current_uses INTEGER DEFAULT 0,
                expires_at TEXT
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS promo_usages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                promo_id INTEGER,
                used_at TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(promo_id) REFERENCES promo_codes(id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                level TEXT,
                message TEXT,
                timestamp TEXT,
                stack TEXT
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS global_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )`);

            // v3.1: User activity for anti-cheat
            db.run(`CREATE TABLE IF NOT EXISTS user_activity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                action TEXT,
                details TEXT, -- JSON
                timestamp TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`);

            // v3.1: Global configs (prices, modifiers)
            db.run(`CREATE TABLE IF NOT EXISTS global_configs (
                key TEXT PRIMARY KEY,
                value TEXT,
                category TEXT,
                description TEXT
            )`);

            // v3.2: Support tickets
            db.run(`CREATE TABLE IF NOT EXISTS support_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                message TEXT,
                file_id TEXT,
                is_from_admin INTEGER DEFAULT 0,
                sender_type TEXT DEFAULT 'user',
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // v3.1: Car definitions (dynamic content)
            db.run(`CREATE TABLE IF NOT EXISTS car_definitions (
                id TEXT PRIMARY KEY,
                name TEXT,
                model TEXT,
                image TEXT,
                description TEXT,
                purchase_price REAL,
                rent_price REAL,
                tank_capacity REAL,
                fuel_consumption REAL,
                has_gas INTEGER DEFAULT 0,
                gas_tank_capacity REAL,
                gas_consumption REAL,
                is_premium INTEGER DEFAULT 0,
                is_container_exclusive INTEGER DEFAULT 0,
                has_autopilot INTEGER DEFAULT 0,
                is_autonomous INTEGER DEFAULT 0
            )`);

            // v2.6 Retention Features
            db.run(`CREATE TABLE IF NOT EXISTS drivers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                name TEXT,
                skill INTEGER DEFAULT 1,
                trust INTEGER DEFAULT 50,
                salary INTEGER DEFAULT 100,
                state TEXT DEFAULT 'idle', -- idle, working, resting
                car_id TEXT,
                hired_at TEXT,
                last_collection TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS jackpot_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                winner_id TEXT,
                amount REAL,
                won_at TEXT,
                FOREIGN KEY(winner_id) REFERENCES users(id)
            )`);

            // v3.3: License Plates Table
            db.run(`CREATE TABLE IF NOT EXISTS license_plates (
                plate_number TEXT PRIMARY KEY,
                owner_id TEXT, -- telegram_id
                rarity TEXT DEFAULT 'common', -- common, rare, legendary
                style TEXT DEFAULT 'standard',
                buffs TEXT DEFAULT '{}', -- JSON: { tip_multiplier: 1.1, police_resistance: 0.5 }
                market_price REAL DEFAULT NULL,
                is_equipped INTEGER DEFAULT 0,
                car_id TEXT, -- ID of the car it's currently on
                created_at TEXT,
                FOREIGN KEY(owner_id) REFERENCES users(telegram_id)
            )`);

            // v3.4: Gas Stations Investment
            db.run(`CREATE TABLE IF NOT EXISTS gas_stations (
                id TEXT PRIMARY KEY,
                name TEXT,
                district_id TEXT,
                owner_id TEXT, -- telegram_id
                purchase_price REAL,
                revenue_total REAL DEFAULT 0,
                price_petrol REAL DEFAULT 6.80,
                price_gas REAL DEFAULT 3.60,
                fuel_stock REAL DEFAULT 0,
                uncollected_revenue REAL DEFAULT 0,
                FOREIGN KEY(owner_id) REFERENCES users(telegram_id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS market_listings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT, -- 'gas_station' or 'license_plate'
                item_id TEXT,
                seller_id TEXT, -- telegram_id or 'SYSTEM'
                price REAL,
                created_at TEXT
            )`);

            db.run(`ALTER TABLE gas_stations ADD COLUMN price_petrol REAL DEFAULT 6.80`, (err) => { });
            db.run(`ALTER TABLE gas_stations ADD COLUMN price_gas REAL DEFAULT 3.60`, (err) => { });
            db.run(`ALTER TABLE gas_stations ADD COLUMN fuel_stock REAL DEFAULT 0`, (err) => { });
            db.run(`ALTER TABLE gas_stations ADD COLUMN uncollected_revenue REAL DEFAULT 0`, (err) => { });

            // Migration: Skills and Hardcore Stats
            db.run(`ALTER TABLE users ADD COLUMN skills TEXT DEFAULT '{"charisma":0,"mechanic":0,"navigator":0}'`, (err) => {
                if (err && !err.message.includes('duplicate column name')) console.error('Migration error (skills):', err.message);
            });

            db.run(`ALTER TABLE users ADD COLUMN cleanliness REAL DEFAULT 100.0`, (err) => {
                if (err && !err.message.includes('duplicate column name')) console.error('Migration error (cleanliness):', err.message);
            });

            db.run(`ALTER TABLE users ADD COLUMN tire_condition REAL DEFAULT 100.0`, (err) => {
                if (err && !err.message.includes('duplicate column name')) console.error('Migration error (tire_condition):', err.message);
            });

            db.run(`ALTER TABLE orders_history ADD COLUMN district_id TEXT`, (err) => {
                if (err && !err.message.includes('duplicate column name')) console.error('Migration error (district_id):', err.message);
            });

            // Initialize Jackpot setting
            db.run(`INSERT OR IGNORE INTO global_settings(key, value) VALUES('jackpot_pool', '0')`, () => {
                // Performance: Add indexes for frequent queries
                db.run(`CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)`, (err) => {
                    if (err && !err.message.includes('already exists')) console.error('Index error:', err.message);
                });
                db.run(`CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders_history(user_id)`, (err) => {
                    if (err && !err.message.includes('already exists')) console.error('Index error:', err.message);
                });
                db.run(`CREATE INDEX IF NOT EXISTS idx_orders_completed_at ON orders_history(completed_at)`, (err) => {
                    if (err && !err.message.includes('already exists')) console.error('Index error:', err.message);
                });
                db.run(`CREATE INDEX IF NOT EXISTS idx_drivers_user_id ON drivers(user_id)`, (err) => {
                    if (err && !err.message.includes('already exists')) console.error('Index error:', err.message);
                });
                db.run(`CREATE INDEX IF NOT EXISTS idx_promo_usages_user ON promo_usages(user_id, promo_id)`, (err) => {
                    if (err && !err.message.includes('already exists')) console.error('Index error:', err.message);
                });
                db.run(`CREATE INDEX IF NOT EXISTS idx_plates_owner ON license_plates(owner_id)`);

                console.log('Migrations and initial settings check completed.');
                console.log('📊 Database indexes verified.');

                // Seed database with initial content
                seedDB().then(() => {
                    // v6.0.2: Clean up license plates without owners requested by user
                    db.run("DELETE FROM license_plates WHERE plate_number IN ('01', 'BOSS', 'II-105-BU') AND owner_id IS NULL", function (err) {
                        if (err) console.error('Error cleaning up license plates:', err.message);
                        else if (this && this.changes > 0) console.log(`Cleaned up ${this.changes} license plates.`);
                    });

                    dbReadyResolve();
                    resolve();
                });
            });
        });
    });
}

async function seedDB() {
    try {
        // 1. Seed Global Configs
        const configs = [
            { key: 'petrol_price', value: '6.80', category: 'prices', description: 'Цена бензина за литр' },
            { key: 'gas_price', value: '3.60', category: 'prices', description: 'Цена газа за литр' },
            { key: 'repair_cost', value: '150', category: 'prices', description: 'Стоимость ремонта (базовая)' },
            { key: 'car_wash_cost', value: '50', category: 'prices', description: 'Стоимость мойки' },
            { key: 'earnings_multiplier', value: '1.0', category: 'multipliers', description: 'Глобальный множитель дохода' }
        ];

        for (const config of configs) {
            await run(`INSERT OR IGNORE INTO global_configs(key, value, category, description) VALUES(?, ?, ?, ?)`,
                [config.key, config.value, config.category, config.description]);
        }

        // 2. Seed Cars
        const cars = [
            { id: 'fabia_blue_rent', name: '🚙 Skoda Fabia (Аренда)', model: 'Skoda Fabia', image: '🚙', description: 'Надёжный автомобиль для начала работы', purchase_price: 0, rent_price: 300, tank_capacity: 45, fuel_consumption: 7.2, has_gas: 0 },
            { id: 'fabia_gas', name: '🚗 Skoda Fabia (ГБО)', model: 'Skoda Fabia', image: '🚗💨', description: 'Своя машина с ГБО, без еженедельной платы', purchase_price: 10000, rent_price: 0, tank_capacity: 45, fuel_consumption: 8.5, has_gas: 1, gas_tank_capacity: 40, gas_consumption: 9.5 },
            { id: 'prius_20_rent', name: '⚡ Toyota Prius 20 (Аренда)', model: 'Toyota Prius 20', image: '/assets/cars/prius_20.png', description: 'Экономичный гибрид', purchase_price: 0, rent_price: 450, tank_capacity: 40, fuel_consumption: 4.5, has_gas: 0 },
            { id: 'prius_20', name: '⚡ Toyota Prius 20', model: 'Toyota Prius 20', image: '/assets/cars/prius_20.png', description: 'Экономичный гибрид в собственность', purchase_price: 35000, rent_price: 0, tank_capacity: 40, fuel_consumption: 4.5, has_gas: 0 },
            { id: 'prius_30', name: '⚡⚡ Toyota Prius 30', model: 'Toyota Prius 30', image: '/assets/cars/prius_30.png', description: 'Улучшенный гибрид', purchase_price: 60000, rent_price: 0, tank_capacity: 43, fuel_consumption: 4.2, has_gas: 0 },
            { id: 'corolla_sedan', name: '🚘 Toyota Corolla Sedan', model: 'Toyota Corolla', image: '🚘', description: 'Надёжный седан', purchase_price: 85000, rent_price: 500, tank_capacity: 50, fuel_consumption: 6.5, has_gas: 0 },
            { id: 'camry', name: '🚙 Toyota Camry', model: 'Toyota Camry', image: '/assets/cars/camry.png', description: 'Премиум автомобиль', purchase_price: 120000, rent_price: 1000, tank_capacity: 60, fuel_consumption: 7.0, has_gas: 0 },
            // New Cars
            { id: 'tesla_3', name: '🔋 Tesla Model 3', model: 'Tesla Model 3', image: '/assets/cars/tesla.png', description: 'Полностью электрический седан будущего', purchase_price: 180000, rent_price: 2500, tank_capacity: 100, fuel_consumption: 0.1, has_gas: 0, is_premium: 1, has_autopilot: 0 },
            { id: 'tesla_s_plaid', name: '🚀 Tesla Model S Plaid', model: 'Tesla Model S Plaid', image: '/assets/cars/tesla_plaid.png', description: 'Самый быстрый седан в мире с автопилотом', purchase_price: 2500000, rent_price: 15000, tank_capacity: 120, fuel_consumption: 0.1, has_gas: 0, is_premium: 1, has_autopilot: 1 },
            { id: 'tesla_3_perf', name: '🚀 Tesla Model 3 Performance', model: 'Tesla Model 3 Performance', image: '/assets/cars/tesla_plaid.png', description: 'Максимальная мощь и поддержка полной автономии', purchase_price: 320000, rent_price: 4500, tank_capacity: 100, fuel_consumption: 0.1, has_gas: 0, is_premium: 1, has_autopilot: 1, is_autonomous: 1 },
            { id: 'mercedes_s', name: '🤵 Mercedes S-Class', model: 'Mercedes-Benz W223', image: '🤵', description: 'Максимальный комфорт и статус', purchase_price: 450000, rent_price: 5000, tank_capacity: 80, fuel_consumption: 12.0, has_gas: 0, is_premium: 1, has_autopilot: 0 }
        ];

        for (const car of cars) {
            // First try to insert, if fails (duplicate id), update the properties
            const sql = `INSERT INTO car_definitions(id, name, model, image, description, purchase_price, rent_price, tank_capacity, fuel_consumption, has_gas, gas_tank_capacity, gas_consumption, is_premium, has_autopilot, is_autonomous)
                         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                         ON CONFLICT(id) DO UPDATE SET
                         name=excluded.name,
                         model=excluded.model,
                         image=excluded.image,
                         description=excluded.description,
                         purchase_price=excluded.purchase_price,
                         rent_price=excluded.rent_price,
                         tank_capacity=excluded.tank_capacity,
                         fuel_consumption=excluded.fuel_consumption,
                         has_gas=excluded.has_gas,
                         gas_tank_capacity=excluded.gas_tank_capacity,
                         gas_consumption=excluded.gas_consumption,
                         is_premium=excluded.is_premium,
                         has_autopilot=excluded.has_autopilot,
                         is_autonomous=excluded.is_autonomous`;

            await run(sql, [
                car.id, car.name, car.model, car.image, car.description,
                car.purchase_price, car.rent_price, car.tank_capacity,
                car.fuel_consumption, car.has_gas || 0, car.gas_tank_capacity || 0,
                car.gas_consumption || 0, car.is_premium || 0,
                car.has_autopilot || 0, car.is_autonomous || 0
            ]);
        }

        // 3. Seed Gas Stations
        const stations = [
            { id: 'suburbs_gas_1', name: '🟢 Газ Зеленая Долина', district_id: 'suburbs', purchase_price: 160000 },
            { id: 'suburbs_gas_2', name: '⛽ Быстрая Заправка (Пригород)', district_id: 'suburbs', purchase_price: 165000 },
            { id: 'center_gas_1', name: '🏢 Городской Энергоцентр', district_id: 'center', purchase_price: 180000 },
            { id: 'center_gas_2', name: '💎 Элитный Центр Газа', district_id: 'center', purchase_price: 190000 },
            { id: 'airport_gas_1', name: '✈️ Заправка Азимут', district_id: 'airport', purchase_price: 210000 },
            { id: 'airport_gas_2', name: '🚀 Реактивный Газ', district_id: 'airport', purchase_price: 225000 },
            { id: 'industrial_gas_1', name: '🏗️ Дизель-Пром', district_id: 'industrial', purchase_price: 175000 },
            { id: 'night_gas_1', name: '🌙 Полуночная Точка', district_id: 'night', purchase_price: 200000 }
        ];

        for (const station of stations) {
            await run(`INSERT OR IGNORE INTO gas_stations(id, name, district_id, purchase_price) VALUES(?, ?, ?, ?)`,
                [station.id, station.name, station.district_id, station.purchase_price]);
        }
    } catch (e) {
        console.error('Error seeding database:', e);
    }
}

// Call initDB when database is opened
db.on('open', () => {
    initDB();
});

// Promisified helper functions
function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
}

module.exports = {
    db,
    query,
    get,
    run,
    initDB,
    dbReady
};
