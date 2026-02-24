class BusinessManager {
    constructor() {
        this.drivers = [];
        this.fleet = []; // {id, name, image}
        this.currentCarId = null;
        this.availableCars = []; // from /api/cars
        this.balance = 0;
        this.init();
    }

    init() {
        const btn = document.getElementById('business-btn');
        if (btn) btn.addEventListener('click', () => this.openScreen());

        const backBtn = document.getElementById('back-from-business');
        if (backBtn) backBtn.addEventListener('click', () => showScreen('main'));

        const hireBtn = document.getElementById('hire-driver-btn');
        if (hireBtn) hireBtn.addEventListener('click', () => this.hireDriver());
    }

    openScreen() {
        showScreen('business');
    }

    closeScreen() {
        showScreen('main');
        if (window.updateUI) window.updateUI();
    }

    async loadData() {
        const user = Telegram.WebApp.initDataUnsafe?.user;
        const telegramId = user ? user.id : 'test_user';

        try {
            // Load business data and available cars in parallel
            const [bizData, carsData] = await Promise.all([
                safeFetchJson(`${API_BASE_URL}/user/${telegramId}/business`),
                safeFetchJson(`${API_BASE_URL}/cars`)
            ]);

            if (!bizData || bizData._isError) {
                throw new Error(`Business data fetch failed: ${bizData?.error || 'Unknown error'}`);
            }
            if (!carsData || carsData._isError) {
                throw new Error(`Cars data fetch failed: ${carsData?.error || 'Unknown error'}`);
            }

            if (bizData.error) {
                showNotification(`Ошибка бизнеса: ${bizData.error}`, 'error', {
                    source: 'BusinessManager.loadData (bizData.error)',
                    error: bizData.error
                });
                return;
            }

            this.drivers = bizData.drivers || [];
            this.fleet = bizData.fleet || [];
            this.currentCarId = bizData.currentCarId;
            this.balance = bizData.balance || 0;
            this.availableCars = (carsData.cars || []).filter(c => c.purchase_price > 0);

            // v3.4: Populate global CARS map for display names
            if (!window.CARS) window.CARS = {};
            (carsData.cars || []).forEach(c => {
                window.CARS[c.id] = c;
            });

            this.render();
        } catch (e) {
            console.error('Error loading business data:', e);
            showNotification(`Ошибка загрузки бизнеса: ${e.message}`, 'error', {
                stack: e.stack,
                message: e.message,
                type: 'BusinessLoadError'
            });
        }
    }

    render() {
        // Stats
        document.getElementById('drivers-count').textContent = this.drivers.length;
        document.getElementById('rented-cars-count').textContent = this.drivers.filter(d => d.car_id).length;

        let income = 0;
        this.drivers.forEach(d => {
            if (d.car_id) income += (d.skill * 10);
        });
        document.getElementById('income-per-hour').textContent = `${income} PLN`;

        // Drivers List
        const driversList = document.getElementById('drivers-list');
        driversList.innerHTML = '';
        if (this.drivers.length === 0) {
            driversList.innerHTML = `
                <div class="empty-state" style="text-align:center; color:#777; padding:20px;">
                    <div style="font-size:3em; margin-bottom:10px;">👔</div>
                    <div>Нет нанятых водителей</div>
                </div>`;
        } else {
            this.drivers.forEach(driver => {
                const carName = driver.car_id ? this.getCarName(driver.car_id) : null;
                const hoursElapsed = (Date.now() - (driver.last_collection || Date.now())) / (1000 * 60 * 60);
                const pendingEarnings = driver.car_id ? Math.floor(hoursElapsed * driver.skill * 10) : 0;

                const div = document.createElement('div');
                div.className = 'driver-card';
                div.innerHTML = `
                    <div class="driver-info">
                        <div class="driver-name">${driver.name}</div>
                        <div class="driver-skill">⭐ Навык: ${driver.skill} | Доход: ${driver.skill * 10}/ч</div>
                        <div class="driver-status">${carName ? `🚗 ${carName}` : '💤 Ожидает авто'}</div>
                    </div>
                    <div class="driver-actions">
                        ${pendingEarnings > 0 ?
                        `<button class="action-btn success small" onclick="businessManager.collect(${driver.id})">💰 ${pendingEarnings} PLN</button>` :
                        driver.car_id ?
                            `<span style="font-size:0.8em; opacity:0.5; color:#888;">Копит...</span>` :
                            `<span style="font-size:0.8em; opacity:0.5; color:#888;">Нет авто</span>`
                    }
                    </div>
                `;
                driversList.appendChild(div);
            });
        }

        // Fleet List (existing cars in fleet)
        const fleetList = document.getElementById('fleet-list');
        fleetList.innerHTML = '';

        // Taken car INSTANCE IDs
        const takenInstanceIds = new Set(this.drivers.map(d => d.car_id).filter(id => id));

        if (this.fleet.length === 0) {
            fleetList.innerHTML = `
                <div class="empty-state" style="text-align:center; color:#777; padding:20px;">
                    <div style="font-size:3em; margin-bottom:10px;">🚗</div>
                    <div>Нет машин в автопарке</div>
                    <div style="font-size:0.85em; color:#555; margin-top:5px;">Купите машину в магазине ниже</div>
                </div>`;
        } else {
            this.fleet.forEach((carInstance, idx) => {
                // carInstance is now {id: "fleet_...", modelId: "...", acquiredAt: "..."}
                // We need to get car definition for name/image
                const carDef = CARS[carInstance.modelId] || { name: carInstance.modelId, image: '🚗' };
                const isTaken = takenInstanceIds.has(carInstance.id);

                const div = document.createElement('div');
                div.className = 'fleet-car-card'; // Assuming there's a style or use inline
                div.style.cssText = 'background:#252525; margin-bottom:10px; padding:12px 15px; border-radius:10px; display:flex; justify-content:space-between; align-items:center; border:1px solid #333;';

                div.innerHTML = `
                    <div>
                        <span style="font-size:1.2em; margin-right:8px;">${carDef.image}</span>
                        <span style="font-weight:bold; color:#e0e0e0;">${carDef.name}</span>
                        <div style="font-size:0.7em; color:#666;">ID: ${carInstance.id.split('_').pop()}</div>
                    </div>
                    ${isTaken ?
                        '<span style="background:#444; color:#888; padding:4px 10px; border-radius:6px; font-size:0.8em;">Занята</span>' :
                        `<button style="background:var(--accent-color, #f39c12); color:white; border:none; padding:6px 14px; border-radius:8px; font-weight:bold; cursor:pointer;" onclick="businessManager.assignCar('${carInstance.id}', '${carInstance.modelId}')">🔑 Назначить</button>`
                    }
                `;
                fleetList.appendChild(div);
            });
        }

        // Fleet Shop (buy new cars)
        this.renderShop();
    }

    renderShop() {
        let shop = document.getElementById('fleet-shop');
        if (!shop) {
            // Create shop section dynamically
            const businessScreen = document.getElementById('business-screen');
            const shopSection = document.createElement('div');
            shopSection.innerHTML = `
                <h3 style="color:white; margin:20px 10px 10px;">🏪 Магазин автопарка</h3>
                <div style="font-size:0.85em; color:#888; margin:0 10px 10px; ">Покупайте машины для сдачи водителям</div>
                <div id="fleet-shop"></div>
            `;
            businessScreen.appendChild(shopSection);
            shop = document.getElementById('fleet-shop');
        }
        shop.innerHTML = '';

        this.availableCars.forEach(car => {
            const canAfford = this.balance >= car.purchase_price;
            const div = document.createElement('div');
            div.style.cssText = 'background:#1e1e2e; margin:8px 10px; padding:14px; border-radius:12px; border:1px solid #333; display:flex; justify-content:space-between; align-items:center;';

            div.innerHTML = `
                <div style="flex:1;">
                    <div style="font-weight:bold; color:#e0e0e0;">
                        <span style="font-size:1.2em; margin-right:6px;">${car.image}</span>
                        ${car.name}
                    </div>
                    <div style="font-size:0.8em; color:#888; margin-top:4px;">${car.description}</div>
                    <div style="font-size:0.8em; color:#aaa; margin-top:2px;">⛽ ${car.fuel_consumption} л/100км</div>
                </div>
                <button style="background:${canAfford ? '#2ecc71' : '#555'}; color:white; border:none; padding:8px 14px; border-radius:8px; font-weight:bold; cursor:${canAfford ? 'pointer' : 'not-allowed'}; min-width:100px; opacity:${canAfford ? 1 : 0.6};"
                    ${canAfford ? '' : 'disabled'}
                    onclick="businessManager.buyCar('${car.id}', ${car.purchase_price})">
                    🛒 ${car.purchase_price.toLocaleString()} PLN
                </button>
            `;
            shop.appendChild(div);
        });
    }

    getCarName(carId) {
        // Try to find in loaded fleet
        const fleetCar = this.fleet.find(c => c.id === carId);
        if (fleetCar) return fleetCar.name;
        // Try available cars
        const shopCar = this.availableCars.find(c => c.id === carId);
        if (shopCar) return shopCar.name;
        return carId; // Fallback
    }

    async buyCar(carId, price) {
        const user = Telegram.WebApp.initDataUnsafe?.user;
        const telegramId = user ? user.id : 'test_user';

        if (confirm(`Купить машину для автопарка за ${price.toLocaleString()} PLN?`)) {
            try {
                const data = await safeFetchJson(`${API_BASE_URL}/user/${telegramId}/fleet/buy`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ carId })
                });
                if (data.success) {
                    showNotification(data.message, 'success');
                    this.loadData();
                } else {
                    showNotification(data.error, 'error');
                }
            } catch (e) {
                console.error(e);
                showNotification('Ошибка покупки', 'error');
            }
        }
    }

    async hireDriver() {
        const user = Telegram.WebApp.initDataUnsafe?.user;
        const telegramId = user ? user.id : 'test_user';

        if (confirm('Нанять водителя за 1000 PLN?')) {
            try {
                const data = await safeFetchJson(`${API_BASE_URL}/user/${telegramId}/drivers/hire`, { method: 'POST' });
                if (data.success) {
                    showNotification(data.message, 'success');
                    this.loadData();
                    if (window.updateUI) window.updateUI();
                } else {
                    showNotification(data.error, 'error');
                }
            } catch (e) { console.error(e); }
        }
    }

    async collect(driverId) {
        const user = Telegram.WebApp.initDataUnsafe?.user;
        const telegramId = user ? user.id : 'test_user';

        try {
            const data = await safeFetchJson(`${API_BASE_URL}/user/${telegramId}/drivers/collect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ driverId })
            });
            if (data.success) {
                showNotification(data.message || `💰 Получено: ${data.earnings} PLN`, 'success');
                this.loadData();
                if (window.updateUI) window.updateUI();
            } else {
                showNotification(data.error, 'error');
            }
        } catch (e) {
            console.error(e);
        }
    }

    async assignCar(instanceId, modelId) {
        const user = Telegram.WebApp.initDataUnsafe?.user;
        const telegramId = user ? user.id : 'test_user';

        const idleDrivers = this.drivers.filter(d => !d.car_id);

        if (idleDrivers.length === 0) {
            showNotification('Нет свободных водителей! Наймите нового.', 'error');
            return;
        }

        // If only one idle driver, assign directly. If multiple, show picker
        if (idleDrivers.length === 1) {
            const driver = idleDrivers[0];
            const carName = this.getCarName(modelId);
            if (confirm(`Назначить ${driver.name} на ${carName}?`)) {
                await this._doAssign(telegramId, driver.id, instanceId);
            }
        } else {
            // Show driver selection
            const names = idleDrivers.map((d, i) => `${i + 1}. ${d.name} (⭐${d.skill})`).join('\n');
            const picked = prompt(`Выберите водителя (номер):\n${names}`);
            const idx = parseInt(picked) - 1;
            if (idx >= 0 && idx < idleDrivers.length) {
                await this._doAssign(telegramId, idleDrivers[idx].id, instanceId);
            }
        }
    }

    async _doAssign(telegramId, driverId, carId) {
        try {
            const data = await safeFetchJson(`${API_BASE_URL}/user/${telegramId}/drivers/assign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ driverId, carId })
            });
            if (data.success) {
                showNotification(data.message, 'success');
                this.loadData();
            } else {
                showNotification(data.error, 'error');
            }
        } catch (e) { console.error(e); }
    }
}

window.businessManager = new BusinessManager();
