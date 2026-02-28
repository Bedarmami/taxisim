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

        // Start initialization
        initDB().catch(e => console.error('Failed to init DB:', e));
    }
});

let dbReadyResolve;
const dbReady = new Promise((resolve) => {
    dbReadyResolve = resolve;
});

function initDB() {
    return new Promise((resolve) => {
        db.serialize(() => {
            // 1. CREATE ALL TABLES FIRST
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                telegram_id TEXT UNIQUE,
                balance REAL DEFAULT 0,
                total_earned REAL DEFAULT 0,
                car_id TEXT,
                car_data TEXT,
                owned_cars_data TEXT,
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
                is_banned INTEGER DEFAULT 0,
                days_passed INTEGER DEFAULT 0,
                week_days INTEGER DEFAULT 0,
                weeks_passed INTEGER DEFAULT 0,
                business_data TEXT,
                achievements_data TEXT,
                last_daily_bonus TEXT,
                created_at TEXT,
                last_login TEXT,
                free_plate_rolls INTEGER DEFAULT 0,
                username TEXT,
                current_district TEXT DEFAULT 'suburbs',
                uncollected_fleet_revenue REAL DEFAULT 0,
                mileage REAL DEFAULT 0,
                last_stamina_update TEXT,
                login_streak INTEGER DEFAULT 0,
                last_login_date TEXT,
                lootboxes_data TEXT DEFAULT '{}',
                lootboxes_given_data TEXT DEFAULT '{}',
                casino_spins_today INTEGER DEFAULT 0,
                casino_last_reset TEXT,
                casino_stats TEXT DEFAULT '{}',
                tutorial_completed INTEGER DEFAULT 0,
                pending_auction_rewards TEXT DEFAULT '[]',
                is_autonomous_active INTEGER DEFAULT 0,
                paid_rests_today INTEGER DEFAULT 0,
                last_autonomous_update TEXT,
                skills TEXT DEFAULT '{"charisma":0,"mechanic":0,"navigator":0}',
                cleanliness REAL DEFAULT 100.0,
                tire_condition REAL DEFAULT 100.0,
                referred_by TEXT,
                referred_count INTEGER DEFAULT 0,
                crypto_taxi_balance REAL DEFAULT 0,
                stocks_data TEXT DEFAULT '{}'
            )`);

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

            db.run(`CREATE TABLE IF NOT EXISTS crypto_prices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT DEFAULT 'TAXI',
                price REAL,
                timestamp TEXT
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS global_events (
                id TEXT PRIMARY KEY,
                name TEXT,
                multiplier REAL DEFAULT 1.0,
                is_active INTEGER DEFAULT 0,
                description TEXT,
                expires_at TEXT
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS promo_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE,
                reward TEXT,
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

            db.run(`CREATE TABLE IF NOT EXISTS user_activity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                action TEXT,
                details TEXT,
                timestamp TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS global_configs (
                key TEXT PRIMARY KEY,
                value TEXT,
                category TEXT,
                description TEXT
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS support_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                message TEXT,
                file_id TEXT,
                is_from_admin INTEGER DEFAULT 0,
                sender_type TEXT DEFAULT 'user',
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

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

            db.run(`CREATE TABLE IF NOT EXISTS drivers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                name TEXT,
                skill INTEGER DEFAULT 1,
                trust INTEGER DEFAULT 50,
                salary INTEGER DEFAULT 100,
                state TEXT DEFAULT 'idle',
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

            db.run(`CREATE TABLE IF NOT EXISTS license_plates (
                plate_number TEXT PRIMARY KEY,
                owner_id TEXT,
                rarity TEXT DEFAULT 'common',
                style TEXT DEFAULT 'standard',
                buffs TEXT DEFAULT '{}',
                market_price REAL DEFAULT NULL,
                is_equipped INTEGER DEFAULT 0,
                car_id TEXT,
                created_at TEXT,
                FOREIGN KEY(owner_id) REFERENCES users(telegram_id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS gas_stations (
                id TEXT PRIMARY KEY,
                name TEXT,
                district_id TEXT,
                owner_id TEXT,
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
                type TEXT,
                item_id TEXT,
                seller_id TEXT,
                price REAL,
                created_at TEXT
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS car_market (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                seller_id TEXT,
                car_id TEXT,
                price REAL,
                created_at TEXT,
                FOREIGN KEY(seller_id) REFERENCES users(telegram_id)
            )`);

            // v3.8: Stock Market
            db.run(`CREATE TABLE IF NOT EXISTS stocks (
                symbol TEXT PRIMARY KEY,
                name TEXT,
                price REAL DEFAULT 100,
                previous_price REAL DEFAULT 100,
                volatility REAL DEFAULT 0.05,
                history TEXT DEFAULT '[]'
            )`);

            // 2. RUN ALL MIGRATIONS
            // 2. RUN ALL MIGRATIONS DEFENSIVELY
            const addColumn = (table, column, definition) => {
                return new Promise((resolve) => {
                    db.all(`PRAGMA table_info(${table})`, (err, columns) => {
                        if (err) {
                            console.error(`Error checking table info for ${table}:`, err.message);
                            return resolve();
                        }
                        const exists = columns.some(c => c.name === column);
                        if (!exists) {
                            db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, (err) => {
                                if (err) console.error(`Migration error (${table}.${column}):`, err.message);
                                resolve();
                            });
                        } else {
                            resolve();
                        }
                    });
                });
            };

            const runMigrations = async () => {
                try {
                    await addColumn('users', 'referred_by', 'TEXT');
                    await addColumn('users', 'referred_count', 'INTEGER DEFAULT 0');
                    await addColumn('users', 'crypto_taxi_balance', 'REAL DEFAULT 0');
                    await addColumn('users', 'last_daily_bonus', 'TEXT');
                    await addColumn('users', 'mileage', 'REAL DEFAULT 0');
                    await addColumn('users', 'last_stamina_update', 'TEXT');
                    await addColumn('users', 'login_streak', 'INTEGER DEFAULT 0');
                    await addColumn('users', 'last_login_date', 'TEXT');
                    await addColumn('users', 'lootboxes_data', "TEXT DEFAULT '{}'");
                    await addColumn('users', 'lootboxes_given_data', "TEXT DEFAULT '{}'");
                    await addColumn('users', 'casino_spins_today', 'INTEGER DEFAULT 0');
                    await addColumn('users', 'casino_last_reset', 'TEXT');
                    await addColumn('users', 'casino_stats', "TEXT DEFAULT '{}'");
                    await addColumn('users', 'tutorial_completed', 'INTEGER DEFAULT 0');
                    await addColumn('users', 'pending_auction_rewards', "TEXT DEFAULT '[]'");
                    await addColumn('users', 'free_plate_rolls', 'INTEGER DEFAULT 0');
                    await addColumn('users', 'username', 'TEXT');
                    await addColumn('users', 'current_district', "TEXT DEFAULT 'suburbs'");
                    await addColumn('users', 'uncollected_fleet_revenue', 'REAL DEFAULT 0');
                    await addColumn('users', 'is_autonomous_active', 'INTEGER DEFAULT 0');
                    await addColumn('users', 'paid_rests_today', 'INTEGER DEFAULT 0');
                    await addColumn('users', 'last_autonomous_update', 'TEXT');
                    await addColumn('users', 'skills', "TEXT DEFAULT '{\"charisma\":0,\"mechanic\":0,\"navigator\":0}'");
                    await addColumn('users', 'cleanliness', 'REAL DEFAULT 100.0');
                    await addColumn('users', 'tire_condition', 'REAL DEFAULT 100.0');
                    await addColumn('support_messages', 'sender_type', "TEXT DEFAULT 'user'");
                    await addColumn('car_definitions', 'has_autopilot', 'INTEGER DEFAULT 0');
                    await addColumn('car_definitions', 'is_autonomous', 'INTEGER DEFAULT 0');
                    await addColumn('jackpot_history', 'winner_id', 'TEXT');
                    await addColumn('orders_history', 'district_id', 'TEXT');
                    await addColumn('gas_stations', 'price_petrol', 'REAL DEFAULT 6.80');
                    await addColumn('gas_stations', 'price_gas', 'REAL DEFAULT 3.60');
                    await addColumn('gas_stations', 'fuel_stock', 'REAL DEFAULT 0');
                    await addColumn('gas_stations', 'uncollected_revenue', 'REAL DEFAULT 0');
                    await addColumn('users', 'stocks_data', "TEXT DEFAULT '{}'"); // v3.8

                    console.log('Database initialization and migrations check completed.');

                    await seedDB();

                    // v6.0.2: Clean up license plates without owners
                    db.run("DELETE FROM license_plates WHERE plate_number IN ('01', 'BOSS', 'II-105-BU') AND owner_id IS NULL");

                    dbReadyResolve();
                    resolve();
                } catch (e) {
                    console.error('Critical Migration/Seed Error:', e);
                    dbReadyResolve(); // Resolve anyway to not hang the server
                    resolve();
                }
            };

            runMigrations();
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
            { id: 'fabia_blue_rent', name: '🚙 Skoda Fabia (Аренда)', model: 'Skoda Fabia', image: '/assets/cars/fabia.png', description: 'Надёжный автомобиль для начала работы', purchase_price: 0, rent_price: 300, tank_capacity: 45, fuel_consumption: 7.2, has_gas: 0 },
            { id: 'fabia_gas', name: '🚗 Skoda Fabia (ГБО)', model: 'Skoda Fabia', image: '/assets/cars/fabia.png', description: 'Своя машина с ГБО, без еженедельной платы', purchase_price: 10000, rent_price: 0, tank_capacity: 45, fuel_consumption: 8.5, has_gas: 1, gas_tank_capacity: 40, gas_consumption: 9.5 },
            { id: 'prius_20_rent', name: '⚡ Toyota Prius 20 (Аренда)', model: 'Toyota Prius 20', image: '/assets/cars/prius_20.png', description: 'Экономичный гибрид (Аренда)', purchase_price: 0, rent_price: 450, tank_capacity: 40, fuel_consumption: 4.5, has_gas: 0 },
            { id: 'prius_20', name: '⚡ Toyota Prius 20', model: 'Toyota Prius 20', image: '/assets/cars/prius_20.png', description: 'Экономичный гибрид в собственность', purchase_price: 35000, rent_price: 0, tank_capacity: 40, fuel_consumption: 4.5, has_gas: 0 },
            { id: 'prius_30_rent', name: '⚡⚡ Toyota Prius 30 (Аренда)', model: 'Toyota Prius 30', image: '/assets/cars/prius_30.png', description: 'Улучшенный гибрид (Аренда)', purchase_price: 0, rent_price: 800, tank_capacity: 43, fuel_consumption: 4.2, has_gas: 0 },
            { id: 'prius_30', name: '⚡⚡ Toyota Prius 30', model: 'Toyota Prius 30', image: '/assets/cars/prius_30.png', description: 'Улучшенный гибрид в собственность', purchase_price: 60000, rent_price: 0, tank_capacity: 43, fuel_consumption: 4.2, has_gas: 0 },
            { id: 'corolla_sedan_rent', name: '🚘 Toyota Corolla Sedan (Аренда)', model: 'Toyota Corolla', image: '/assets/cars/corolla.png', description: 'Надёжный седан (Аренда)', purchase_price: 0, rent_price: 1200, tank_capacity: 50, fuel_consumption: 6.5, has_gas: 0 },
            { id: 'corolla_sedan', name: '🚘 Toyota Corolla Sedan', model: 'Toyota Corolla', image: '/assets/cars/corolla.png', description: 'Надёжный седан в собственность', purchase_price: 85000, rent_price: 500, tank_capacity: 50, fuel_consumption: 6.5, has_gas: 0 },
            { id: 'camry_rent', name: '🚙 Toyota Camry (Аренда)', model: 'Toyota Camry', image: '/assets/cars/camry.png', description: 'Премиум автомобиль (Аренда)', purchase_price: 0, rent_price: 1800, tank_capacity: 60, fuel_consumption: 7.0, has_gas: 0 },
            { id: 'camry', name: '🚙 Toyota Camry', model: 'Toyota Camry', image: '/assets/cars/camry.png', description: 'Премиум автомобиль', purchase_price: 120000, rent_price: 1000, tank_capacity: 60, fuel_consumption: 7.0, has_gas: 0 },
            // New Cars
            { id: 'tesla_3', name: '🔋 Tesla Model 3', model: 'Tesla Model 3', image: '/assets/cars/tesla.png', description: 'Полностью электрический седан будущего', purchase_price: 180000, rent_price: 2500, tank_capacity: 100, fuel_consumption: 0.1, has_gas: 0, is_premium: 1, has_autopilot: 0 },
            { id: 'tesla_s_plaid', name: '🚀 Tesla Model S Plaid', model: 'Tesla Model S Plaid', image: '/assets/cars/tesla_plaid.png', description: 'Самый быстрый седан в мире с автопилотом', purchase_price: 2500000, rent_price: 15000, tank_capacity: 120, fuel_consumption: 0.1, has_gas: 0, is_premium: 1, has_autopilot: 1 },
            { id: 'tesla_3_perf', name: '🚀 Tesla Model 3 Performance', model: 'Tesla Model 3 Performance', image: '/assets/cars/tesla_plaid.png', description: 'Максимальная мощь и поддержка полной автономии', purchase_price: 320000, rent_price: 4500, tank_capacity: 100, fuel_consumption: 0.1, has_gas: 0, is_premium: 1, has_autopilot: 1, is_autonomous: 1 },
            { id: 'mercedes_s', name: '🤵 Mercedes S-Class', model: 'Mercedes-Benz W223', image: '/assets/cars/mercedes.png', description: 'Максимальный комфорт и статус', purchase_price: 450000, rent_price: 5000, tank_capacity: 80, fuel_consumption: 12.0, has_gas: 0, is_premium: 1, has_autopilot: 0 }
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

        // 4. Seed Global Events
        const events = [
            { id: 'rain', name: '🌧️ Проливной дождь', description: 'Повышенный спрос на такси! Доход x1.5', multiplier: 1.5 },
            { id: 'snow', name: '❄️ Снегопад', description: 'Дороги замело, тарифы выросли! Доход x2.0', multiplier: 2.0 },
            { id: 'rush_hour', name: '🌆 Час пик', description: 'Весь город в движении! Доход x1.3', multiplier: 1.3 },
            { id: 'holiday', name: '🎉 Праздники', description: 'Время подарков и поездок! Доход x1.8', multiplier: 1.8 }
        ];

        for (const ev of events) {
            await run(`INSERT OR IGNORE INTO global_events(id, name, description, multiplier) VALUES(?, ?, ?, ?)`,
                [ev.id, ev.name, ev.description, ev.multiplier]);
        }

        // 5. Seed Crypto Defaults
        const cryptoDefaults = [
            { key: 'crypto_min_fluctuation', value: '-0.05' },
            { key: 'crypto_max_fluctuation', value: '0.05' },
            { key: 'crypto_fluctuation_interval_ms', value: '300000' } // 5 mins
        ];

        for (const conf of cryptoDefaults) {
            await run(`INSERT OR IGNORE INTO global_settings(key, value) VALUES(?, ?)`, [conf.key, conf.value]);
        }
    } catch (e) {
        console.error('Error seeding database:', e);
    }
}


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
