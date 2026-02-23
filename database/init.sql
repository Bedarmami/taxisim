-- Создание базы данных
CREATE DATABASE taxi_simulator;

\c taxi_simulator;

-- Таблица автомобилей
CREATE TABLE cars (
    id SERIAL PRIMARY KEY,
    model VARCHAR(100) NOT NULL,
    fuel_consumption DECIMAL(4,2) NOT NULL, -- литров на 100 км
    tank_capacity DECIMAL(5,2) NOT NULL, -- литров
    rent_price DECIMAL(10,2) NOT NULL -- в неделю
);

-- Таблица пользователей
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    telegram_id VARCHAR(100) UNIQUE NOT NULL,
    balance DECIMAL(10,2) DEFAULT 1500.00,
    car_id INTEGER REFERENCES cars(id) DEFAULT 1,
    fuel_level DECIMAL(5,2) DEFAULT 50.00,
    rent_paid_until TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица заказов (для логирования, опционально)
CREATE TABLE orders_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    from_location VARCHAR(255),
    to_location VARCHAR(255),
    distance DECIMAL(5,2),
    price DECIMAL(10,2),
    fuel_used DECIMAL(5,2),
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Вставка начальных данных автомобилей
INSERT INTO cars (model, fuel_consumption, tank_capacity, rent_price) VALUES
('Skoda Fabia', 7.0, 50.0, 300.00),
('Toyota Corolla', 6.5, 55.0, 400.00),
('Ford Focus', 8.0, 52.0, 350.00);