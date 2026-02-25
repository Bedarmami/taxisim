class BusinessManager {
    constructor() {
        this.drivers = [];
        this.fleet = []; // {id, name, image}
        this.currentCarId = null;
        this.availableCars = []; // from /api/cars
        this.gasStations = []; // v3.4: Investments
        this.balance = 0;
        this.currentTab = 'drivers'; // Default tab
        this.init();
    }

    init() {
        const btn = document.getElementById('business-btn');
        if (btn) btn.addEventListener('click', () => this.openScreen());

        const backBtn = document.getElementById('back-from-business');
        if (backBtn) backBtn.addEventListener('click', () => showScreen('main'));

        const hireBtn = document.getElementById('hire-driver-btn');
        if (hireBtn) hireBtn.addEventListener('click', () => this.hireDriver());

        this.setupTabs();
    }

    setupTabs() {
        const tabs = document.querySelectorAll('.biz-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.getAttribute('data-tab');
                this.switchTab(target);
            });
        });
    }

    switchTab(tabName) {
        console.log('Switching to tab:', tabName);
        this.currentTab = tabName;

        // Update tab buttons
        const tabs = document.querySelectorAll('.biz-tab');
        tabs.forEach(btn => {
            if (btn.getAttribute('data-tab') === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update content containers
        const contents = document.querySelectorAll('.tab-content');
        contents.forEach(content => {
            if (content.id === `tab-${tabName}`) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });

        if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
        }
    }

    openScreen() {
        showScreen('business');
        this.switchTab(this.currentTab || 'drivers');
        this.loadData();
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
            const [bizData, carsData, marketData] = await Promise.all([
                safeFetchJson(`${API_BASE_URL}/user/${telegramId}/business`),
                safeFetchJson(`${API_BASE_URL}/cars`),
                safeFetchJson(`${API_BASE_URL}/market`)
            ]);

            if (!bizData || bizData._isError) {
                throw new Error(`Business data fetch failed: ${bizData?.error || 'Unknown error'}`);
            }
            if (!carsData || carsData._isError) {
                throw new Error(`Cars data fetch failed: ${carsData?.error || 'Unknown error'}`);
            }
            if (!marketData || marketData._isError) {
                console.warn('Market data fetch failed, skipping market rendering');
                this.marketListings = [];
            } else {
                this.marketListings = marketData;
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
            this.currentCar = bizData.car;
            this.balance = bizData.balance || 0;
            this.uncollectedFleetRevenue = bizData.uncollected_fleet_revenue || 0;
            this.availableCars = (carsData.cars || []).filter(c => c.purchase_price > 0);

            // v3.4: Populate global CARS map for display names
            if (!window.CARS) window.CARS = {};
            (carsData.cars || []).forEach(c => {
                window.CARS[c.id] = c;
            });

            // v3.4: Load Investments
            const stationsData = await safeFetchJson(`${API_BASE_URL}/investments`);
            if (stationsData && !stationsData._isError) {
                this.gasStations = stationsData;
            }

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

        // Update active car mileage info if element exists
        const mileageContainer = document.getElementById('biz-car-mileage');
        if (mileageContainer && this.currentCar) {
            mileageContainer.innerHTML = `
                <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:10px; font-size:0.85em; margin-bottom:15px; border:1px solid #333; display:flex; justify-content:space-between; align-items:center;">
                    <div style="color:#aaa;">🚗 Активное авто: <span style="color:#fff; font-weight:bold;">${this.currentCar.name}</span></div>
                    <div style="color:#aaa;">🛤️ Пробег: <span style="color:var(--accent-color); font-weight:bold;">${(this.currentCar.mileage || 0).toFixed(1)} км</span></div>
                </div>
            `;
        }

        // Update Fleet withdrawal button if it exists
        const fleetWithdrawContainer = document.getElementById('fleet-withdraw-container');
        if (fleetWithdrawContainer) {
            fleetWithdrawContainer.innerHTML = `
                <div style="background:rgba(46, 204, 113, 0.05); border:1px solid #2ecc7133; border-radius:12px; padding:12px; margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-size:0.75em; color:#888; text-transform:uppercase;">Касса автопарка</div>
                        <div style="font-size:1.1em; font-weight:bold; color:#2ecc71;">${(this.uncollectedFleetRevenue || 0).toFixed(2)} PLN</div>
                    </div>
                    <button class="action-btn success small" 
                            ${this.uncollectedFleetRevenue > 0 ? '' : 'disabled style="opacity:0.5"'}
                            onclick="businessManager.withdrawFleetProfit()">💰 Снять (-10%)</button>
                </div>
            `;
        }
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

        // Fleet List (unified: personal + rented)
        const fleetList = document.getElementById('fleet-list');
        fleetList.innerHTML = '';

        // Taken car INSTANCE IDs
        const takenInstanceIds = new Set(this.drivers.map(d => d.car_id).filter(id => id));

        if (this.fleet.length === 0) {
            fleetList.innerHTML = `
                <div class="empty-state" style="text-align:center; color:#777; padding:20px;">
                    <div style="font-size:3em; margin-bottom:10px;">🚗</div>
                    <div>Автопарк пуст</div>
                    <div style="font-size:0.85em; color:#555; margin-top:5px;">Купите машину в магазине или имейте личную</div>
                </div>`;
        } else {
            this.fleet.forEach((carInstance) => {
                const carDef = CARS[carInstance.modelId] || { name: carInstance.modelId, image: '🚗' };
                const isTaken = takenInstanceIds.has(carInstance.id);
                const isActive = this.currentCarId === carInstance.modelId;
                const isPersonal = carInstance.type === 'personal';

                const div = document.createElement('div');
                div.className = 'fleet-car-card';
                div.style.cssText = 'background:#252525; margin-bottom:10px; padding:12px 15px; border-radius:12px; display:flex; justify-content:space-between; align-items:center; border:1px solid #333;';

                div.innerHTML = `
                    <div style="display:flex; align-items:center;">
                        <span style="font-size:1.8em; margin-right:12px;">${carDef.image}</span>
                        <div>
                            <div style="font-weight:bold; color:#fff;">${carDef.name}</div>
                            <div style="font-size:0.75em; color:#777;">
                                ${isPersonal ? '<span style="color:var(--accent-color);">⭐ Личная</span>' : '🏢 Аренда'} | 
                                ID: ${carInstance.id.split('_').pop()}
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; gap:8px;">
                        ${isActive ?
                        '<span style="background:rgba(46, 204, 113, 0.2); color:#2ecc71; padding:6px 12px; border-radius:10px; font-size:0.8em; font-weight:bold; border:1px solid #2ecc7144;">🔋 Активна</span>' :
                        `<button class="action-btn small" style="background:#555; color:white;" onclick="businessManager.selectCar('${carInstance.modelId}')">🚗 Ехать</button>`
                    }
                        ${isTaken ?
                        '<span style="background:#444; color:#888; padding:6px 12px; border-radius:10px; font-size:0.8em; border:1px solid #555;">Занята</span>' :
                        `<button class="action-btn success small" onclick="businessManager.assignCar('${carInstance.id}', '${carInstance.modelId}')">🔑 Нанять</button>`
                    }
                    </div>
                `;
                fleetList.appendChild(div);
            });
        }

        // Fleet Shop (buy new cars)
        this.renderShop();

        // v3.4: Gas Station Investments
        this.renderInvestments();

        // v3.5: Market System
        this.renderMarket();
    }

    renderInvestments() {
        const invList = document.getElementById('investments-list');
        if (!invList) return; // Should exist in index.html now

        invList.innerHTML = '';

        if (this.gasStations.length === 0) {
            invList.innerHTML = '<div class="empty-state">Нет доступных объектов для инвестиций</div>';
            return;
        }

        this.gasStations.forEach(station => {
            const isOwned = !!station.owner_id;
            const currentUserId = Telegram.WebApp.initDataUnsafe?.user?.id?.toString() || 'test_user';
            const isMine = station.owner_id?.toString() === currentUserId;
            const canAfford = this.balance >= station.purchase_price;

            const div = document.createElement('div');
            div.style.cssText = 'background:#1a1a1a; margin:10px; padding:15px; border-radius:15px; border:1px solid #333; position:relative; overflow:hidden;';

            if (isMine) div.style.borderColor = 'var(--accent-color)';

            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <div>
                        <div style="font-weight:bold; font-size:1.1em; color:white;">${station.name}</div>
                        <div style="font-size:0.8em; color:#888;">Район: ${station.district_id}</div>
                    </div>
                    ${isOwned ?
                    `<span style="background:${isMine ? '#2ecc71' : '#e74c3c'}33; color:${isMine ? '#2ecc71' : '#e74c3c'}; padding:4px 10px; border-radius:8px; font-size:0.75em; font-weight:bold;">
                            ${isMine ? '💼 ВАША' : '🔒 ВЫКУПЛЕНО'}
                        </span>` :
                    `<span style="color:#f1c40f; font-weight:bold;">${station.purchase_price.toLocaleString()} PLN</span>`
                }
                </div>
                
                <div style="margin-top:15px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-size:0.85em; color:#aaa;">
                        <span title="Общий доход за все время">📊 Всего: ${(station.revenue_total || 0).toFixed(2)} PLN</span>
                    </div>
                    ${!isOwned ?
                    `<button class="action-btn success small" 
                            style="padding:6px 15px; ${canAfford ? '' : 'opacity:0.5'}" 
                            ${canAfford ? '' : 'disabled'}
                            onclick="businessManager.buyStation('${station.id}')">
                            Купить
                        </button>` : ''
                }
                </div>

                ${isMine ? `
                    <div style="margin-top:15px; border-top:1px solid #333; padding-top:12px;">
                        <div style="font-size:0.8em; color:#888; margin-bottom:8px;">Управление ценами (PLN/литр):</div>
                        <div style="display:flex; gap:10px; align-items:center;">
                            <div style="flex:1;">
                                <label style="display:block; font-size:0.7em; color:#666; margin-bottom:2px;">⛽ Бензин</label>
                                <input type="number" id="petrol-price-${station.id}" value="${station.price_petrol || 6.80}" step="0.1" style="width:100%; background:#000; border:1px solid #444; color:white; padding:6px; border-radius:8px; font-size:0.9em;">
                            </div>
                            <div style="flex:1;">
                                <label style="display:block; font-size:0.7em; color:#666; margin-bottom:2px;">🔵 Газ</label>
                                <input type="number" id="gas-price-${station.id}" value="${station.price_gas || 3.60}" step="0.1" style="width:100%; background:#000; border:1px solid #444; color:white; padding:6px; border-radius:8px; font-size:0.9em;">
                            </div>
                            <button class="action-btn small" 
                                    style="margin-top:14px; height:34px; padding:0 12px; background:#3498db;" 
                                    onclick="businessManager.updatePrices('${station.id}')" title="Сохранить цены">
                                💾
                            </button>
                        </div>
                        
                        <div style="margin-top:12px; display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.3); padding:10px; border-radius:10px;">
                            <div>
                                <div style="font-size:0.75em; color:#888;">📦 Запас топлива:</div>
                                <div style="font-weight:bold; color:${station.fuel_stock < 50 ? '#e74c3c' : '#2ecc71'};">${(station.fuel_stock || 0).toFixed(1)} л</div>
                            </div>
                            <button class="action-btn small" style="background:#f39c12; padding:4px 10px;" onclick="businessManager.buyStock('${station.id}')">➕ Закупка</button>
                        </div>

                        ${isMine ? `
                            <div style="margin-top:15px; border-top:1px solid #333; padding-top:12px;">
                                <div style="margin-top:10px; display:flex; justify-content:space-between; align-items:center; background:rgba(46, 204, 113, 0.1); padding:10px; border-radius:10px; border:1px solid #2ecc71;">
                                    <div>
                                        <div style="font-size:0.75em; color:#888;">💰 В кассе:</div>
                                        <div style="font-weight:bold; color:#2ecc71;">${(station.uncollected_revenue || 0).toFixed(2)} PLN</div>
                                    </div>
                                    <button class="action-btn success small" onclick="businessManager.withdrawStationProfit('${station.id}')">💰 Снять</button>
                                </div>
                            </div>
                        ` : ''}

                        <div style="margin-top:10px; border-top:1px dashed #333; padding-top:8px; display:flex; justify-content:center;">
                            <button class="action-btn small" 
                                    style="background:transparent; color:#e74c3c; border:1px solid #e74c3c; padding:4px 12px; font-size:0.8em;" 
                                    onclick="businessManager.sellStationToState('${station.id}')">
                                🏦 Продать гос. (-30%)
                            </button>
                        </div>
                    </div>
                ` : `
                    <div style="margin-top:10px; display:flex; gap:15px; font-size:0.8em; color:#777; background:rgba(255,255,255,0.03); padding:8px; border-radius:8px;">
                        <span>⛽ ${station.price_petrol?.toFixed(2) || '6.80'}</span>
                        <span>🔵 ${station.price_gas?.toFixed(2) || '3.60'}</span>
                        <span style="margin-left:auto; color:${station.fuel_stock < 20 ? '#e74c3c' : '#888'};">📦 ${station.fuel_stock?.toFixed(0) || 0}л</span>
                    </div>
                `}
            `;
            invList.appendChild(div);
        });
    }

    async buyStation(stationId) {
        const user = Telegram.WebApp.initDataUnsafe?.user;
        const telegramId = user ? user.id : 'test_user';

        const station = this.gasStations.find(s => s.id === stationId);
        if (!station) return;

        if (confirm(`Вы действительно хотите купить ${station.name} за ${station.purchase_price.toLocaleString()} PLN ? `)) {
            try {
                const data = await safeFetchJson(`${API_BASE_URL}/investments/buy`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telegramId, stationId })
                });

                if (data.success) {
                    showNotification(data.message, 'success');
                    this.loadData();
                } else {
                    showNotification(data.error || 'Ошибка покупки', 'error');
                }
            } catch (e) {
                showNotification('Ошибка при покупке', 'error');
            }
        }
    }

    async updatePrices(stationId) {
        const user = Telegram.WebApp.initDataUnsafe?.user;
        const telegramId = user ? user.id : 'test_user';

        const pricePetrol = parseFloat(document.getElementById(`petrol-price-${stationId}`).value);
        const priceGas = parseFloat(document.getElementById(`gas-price-${stationId}`).value);

        try {
            const data = await safeFetchJson(`${API_BASE_URL}/investments/update-prices`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegramId, stationId, pricePetrol, priceGas })
            });

            if (data.success) {
                showNotification(data.message, 'success');
                this.loadData();
            } else {
                showNotification(data.error || 'Ошибка обновления цен', 'error');
            }
        } catch (e) {
            showNotification('Ошибка при обновлении цен', 'error');
        }
    }

    renderShop() {
        const shop = document.getElementById('fleet-shop');
        if (!shop) return;
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
                </div >
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

        if (confirm(`Купить машину для автопарка за ${price.toLocaleString()} PLN ? `)) {
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
            const picked = prompt(`Выберите водителя(номер): \n${names} `);
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

    async selectCar(modelId) {
        const user = Telegram.WebApp.initDataUnsafe?.user;
        const telegramId = user ? user.id : 'test_user';
        try {
            const data = await safeFetchJson(`${API_BASE_URL}/user/${telegramId}/select-car`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modelId })
            });

            if (data && data.success) {
                showNotification(`Вы выбрали ${data.car.name}!`, 'success');
                this.loadData();
                if (window.updateMainScreen) window.updateMainScreen();
            } else {
                showNotification(`Ошибка: ${data?.error || 'Unknown'}`, 'error');
            }
        } catch (e) {
            console.error('Error selecting car:', e);
            showNotification('Ошибка при выборе машины', 'error');
        }
    }

    async sellStationToState(stationId) {
        const user = Telegram.WebApp.initDataUnsafe?.user;
        const telegramId = user ? user.id : 'test_user';

        const station = this.gasStations.find(s => s.id === stationId);
        if (!station) return;

        const refund = Math.floor(station.purchase_price * 0.7);
        if (confirm(`Вы действительно хотите продать ${station.name} государству за ${refund.toLocaleString()} PLN ? (Это вернет 70 % стоимости)`)) {
            try {
                const data = await safeFetchJson(`${API_BASE_URL}/investments/sell-to-state`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telegramId, stationId })
                });

                if (data.success) {
                    showNotification(data.message, 'success');
                    this.loadData();
                } else {
                    showNotification(data.error || 'Ошибка продажи', 'error');
                }
            } catch (e) {
                showNotification('Ошибка при продаже', 'error');
            }
        }
    }

    async buyStock(stationId) {
        const user = Telegram.WebApp.initDataUnsafe?.user;
        const telegramId = user ? user.id : 'test_user';
        const liters = parseInt(prompt('Сколько литров закупить? (1 литр = 4.0 PLN)', '50')) || 0;

        if (liters <= 0) return;

        try {
            const data = await safeFetchJson(`${API_BASE_URL}/investments/buy-stock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegramId, stationId, liters })
            });

            if (data.success) {
                showNotification(data.message, 'success');
                this.loadData();
                if (window.updateUI) window.updateUI();
            } else {
                showNotification(data.error || 'Ошибка закупки', 'error');
            }
        } catch (e) {
            console.error(e);
            showNotification('Ошибка при закупке', 'error');
        }
    }

    async withdrawStationProfit(stationId) {
        const user = Telegram.WebApp.initDataUnsafe?.user;
        const telegramId = user ? user.id : 'test_user';

        try {
            const data = await safeFetchJson(`${API_BASE_URL}/investments/withdraw`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegramId, stationId })
            });

            if (data.success) {
                showNotification(data.message, 'success');
                this.loadData();
                if (window.updateUI) window.updateUI();
            } else {
                showNotification(data.error || 'Ошибка снятия прибыли', 'error');
            }
        } catch (e) {
            console.error(e);
            showNotification('Ошибка при снятии прибыли', 'error');
        }
    }

    async withdrawFleetProfit() {
        const user = Telegram.WebApp.initDataUnsafe?.user;
        const telegramId = user ? user.id : 'test_user';

        try {
            const data = await safeFetchJson(`${API_BASE_URL}/user/${telegramId}/withdraw-fleet`, {
                method: 'POST'
            });

            if (data.success) {
                showNotification(data.message, 'success');
                this.loadData();
                if (window.updateUI) window.updateUI();
            } else {
                showNotification(data.error || 'Ошибка снятия прибыли', 'error');
            }
        } catch (e) {
            console.error(e);
            showNotification('Ошибка при снятии прибыли', 'error');
        }
    }

    renderMarket() {
        const marketList = document.getElementById('market-list');
        if (!marketList) return;

        marketList.innerHTML = '';

        if (!this.marketListings || this.marketListings.length === 0) {
            marketList.innerHTML = '<div class="empty-state" style="padding:20px; text-align:center; opacity:0.6;">На рынке пока пусто...</div>';
            return;
        }

        this.marketListings.forEach(listing => {
            const canAfford = this.balance >= listing.price;
            const div = document.createElement('div');
            div.style.cssText = 'background:#1a1a1a; margin-bottom:12px; padding:15px; border-radius:15px; border:1px solid #333;';

            let title = 'Предмет';
            let description = '';
            let icon = '⚖️';

            if (listing.type === 'gas_station') {
                title = `АЗС "${listing.station_name || listing.item_id}"`;
                description = 'Конфискованная заправка';
                icon = '⛽';
            } else if (listing.type === 'license_plate') {
                title = `Номер "${listing.item_id}"`;
                description = `Продавец: ${listing.seller_id === 'SYSTEM' ? 'Система' : 'Игрок'}`;
                icon = '🆔';
            }

            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span style="font-size:1.5em;">${icon}</span>
                        <div>
                            <div style="font-weight:bold; color:white;">${title}</div>
                            <div style="font-size:0.8em; color:#888;">${description}</div>
                        </div>
                    </div>
                    <div>
                        <div style="font-weight:bold; color:var(--accent-color); margin-bottom:5px; text-align:right;">${listing.price.toLocaleString()} PLN</div>
                        <button class="action-btn success small" 
                                style="padding:4px 12px;"
                                ${canAfford ? '' : 'disabled style="opacity:0.5;"'} 
                                onclick="businessManager.buyFromMarket(${listing.id})">
                            Купить
                        </button>
                    </div>
                </div>
            `;
            marketList.appendChild(div);
        });
    }

    async buyFromMarket(listingId) {
        const user = Telegram.WebApp.initDataUnsafe?.user;
        const telegramId = user ? user.id : 'test_user';

        if (!confirm('Вы действительно хотите совершить покупку?')) return;

        try {
            const data = await safeFetchJson(`${API_BASE_URL}/market/buy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegramId, listingId })
            });

            if (data.success) {
                showNotification(data.message, 'success');
                this.loadData();
                if (window.updateUI) window.updateUI();
            } else {
                showNotification(data.error || 'Ошибка покупки', 'error');
            }
        } catch (e) {
            console.error(e);
            showNotification('Ошибка при покупке на рынке', 'error');
        }
    }
}

window.businessManager = new BusinessManager();
