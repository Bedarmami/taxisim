const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'data', 'taxi.db');
const db = new sqlite3.Database(dbPath);

const carMap = {
    'prius_20_rent': '/assets/cars/prius_20.png',
    'prius_20': '/assets/cars/prius_20.png',
    'prius_30': '/assets/cars/prius_30.png',
    'camry': '/assets/cars/camry.png',
    'tesla_3': '/assets/cars/tesla.png'
};

db.serialize(() => {
    db.all("SELECT id, owned_cars_data, car_data FROM users", [], (err, users) => {
        if (err) {
            console.error(err.message);
            db.close();
            return;
        }

        let pending = 0;

        users.forEach(user => {
            let updatedOwned = false;
            let updatedCurrent = false;

            // Update owned cars list
            let ownedCars = [];
            try {
                ownedCars = JSON.parse(user.owned_cars_data || '[]');
                ownedCars.forEach(car => {
                    if (carMap[car.id]) {
                        car.image = carMap[car.id];
                        updatedOwned = true;
                    }
                });
            } catch (e) { }

            // Update current car data
            let currentCar = null;
            try {
                if (user.car_data) {
                    currentCar = JSON.parse(user.car_data);
                    if (currentCar && carMap[currentCar.id]) {
                        currentCar.image = carMap[currentCar.id];
                        updatedCurrent = true;
                    }
                }
            } catch (e) { }

            if (updatedOwned || updatedCurrent) {
                const ownedJson = JSON.stringify(ownedCars);
                const currentJson = currentCar ? JSON.stringify(currentCar) : user.car_data;

                pending++;
                db.run("UPDATE users SET owned_cars_data = ?, car_data = ? WHERE id = ?", [ownedJson, currentJson, user.id], (err) => {
                    pending--;
                    if (err) console.error(`Error updating user ${user.id}:`, err.message);
                    else console.log(`Updated car data for user ${user.id}`);

                    if (pending === 0) {
                        console.log('All users updated.');
                        db.close();
                    }
                });
            }
        });

        if (pending === 0) {
            console.log('No users needed updates.');
            db.close();
        }
    });
});
