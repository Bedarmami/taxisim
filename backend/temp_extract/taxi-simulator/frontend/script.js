// ============= ИНИЦИАЛИЗАЦИЯ TELEGRAM WEB APP =============
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    if (tg.version >= '6.1') {
        tg.BackButton.hide();
    }
}

// ============= ГЛОБАЛЬНОЕ СОСТОЯНИЕ =============
let userData = null;
let orders = [];
let orderTimers = [];
let currentFilter = 'all';

// ============= КОНФИГУРАЦИЯ =============
const API_BASE_URL = 'http://localhost:3000/api';
const TELEGRAM_ID = tg?.initDataUnsafe?.user?.id || 'test_user_123';

// ============= ПАРТНЁРЫ =============
const PARTNERS = [
    {
        id: 1,
        name: '👤 Начинающий',
        description: 'Делим 50/50, их машина, их топливо',
        revenue_split: 0.5,
        provides_car: true,
        fuel_provided: true,
        weekly_cost: 0,
        requirements: { rides: 0 }
    },
    {
        id: 2,
        name: '🤝 Автономный',
        description: 'Делим 60/40, своя машина, своё топливо',
        revenue_split: 0.4,
        provides_car: false,
        fuel_provided: false,
        weekly_cost: 170,
        requirements: { rides: 200 }
    },
    {
        id: 3,
        name: '👔 Бизнес-партнёр',
        description: 'Делим 70/30, +20% к заказам',
        revenue_split: 0.3,
        provides_car: false,
        fuel_provided: false,
        weekly_cost: 350,
        bonus_orders: 1.2,
        requirements: { rides: 450 }
    },
    {
        id: 4,
        name: '💼 Инвестор',
        description: 'Делим 80/20, платит за топливо',
        revenue_split: 0.2,
        provides_car: false,
        fuel_provided: true,
        weekly_cost: 600,
        bonus_orders: 1.3,
        requirements: { rides: 700 }
    },
    {
        id: 5,
        name: '👑 VIP партнёр',
        description: 'Делим 90/10, лучшие заказы',
        revenue_split: 0.1,
        provides_car: false,
        fuel_provided: true,
        weekly_cost: 1200,
        bonus_orders: 1.5,
        vip_orders: true,
        requirements: { rides: 1000 }
    }
];

// ============= ЭЛЕМЕНТЫ DOM =============
const screens = {
    main: document.getElementById('main-screen'),
    orders: document.getElementById('orders-screen'),
    fuel: document.getElementById('fuel-screen'),
    garage: document.getElementById('garage-screen'),
    partners: document.getElementById('partners-screen')
};

// ============= ИНИЦИАЛИЗАЦИЯ =============
async function initApp() {
    try {
        console.log('🚀 Инициализация приложения...');
        console.log('Telegram ID:', TELEGRAM_ID);
        
        setupEventListeners();
        await loadUserData();
        
        // Обновление каждые 30 секунд
        setInterval(loadUserData, 30000);
        
        showNotification('🚖 Добро пожаловать в Такси Симулятор!', 'info');
    } catch (error) {
        console.error('Init error:', error);
        showNotification('❌ Ошибка инициализации', 'error');
    }
}

// ============= ЗАГРУЗКА ДАННЫХ ПОЛЬЗОВАТЕЛЯ =============
async function loadUserData() {
    try {
        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        userData = await response.json();
        
        localStorage.setItem('userData', JSON.stringify(userData));
        
        updateMainScreen();
        updateFuelScreen();
        updateGarageScreen();
        updatePartnerInfo();
        
    } catch (error) {
        console.error('Error loading user data:', error);
        const saved = localStorage.getItem('userData');
        if (saved) {
            userData = JSON.parse(saved);
            updateMainScreen();
            updateFuelScreen();
            updateGarageScreen();
            updatePartnerInfo();
            showNotification('⚠️ Загружены сохранённые данные', 'warning');
        } else {
            showNotification('❌ Ошибка загрузки данных', 'error');
        }
    }
}

// ============= ЗАГРУЗКА ЗАКАЗОВ =============
async function loadOrders() {
    try {
        const ordersList = document.getElementById('orders-list');
        if (ordersList) {
            ordersList.innerHTML = '<div class="loading">⏳ Загрузка заказо��...</div>';
        }
        
        const response = await fetch(`${API_BASE_URL}/orders/${TELEGRAM_ID}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        orders = await response.json();
        
        orderTimers.forEach(timer => clearTimeout(timer));
        orderTimers = [];
        
        displayOrders();
        
        if (orders && orders.length > 0) {
            showNotification(`✅ Загружено ${orders.length} новых заказов`, 'success');
        }
        
    } catch (error) {
        console.error('Error loading orders:', error);
        showNotification('❌ Ошибка загрузки заказов', 'error');
    }
}

// ============= ОТОБРАЖЕНИЕ ЗАКАЗОВ =============
function displayOrders() {
    const ordersList = document.getElementById('orders-list');
    if (!ordersList) return;
    
    if (!orders || orders.length === 0) {
        ordersList.innerHTML = `
            <div class="no-orders">
                <div style="font-size: 40px; margin-bottom: 15px;">🚕</div>
                <div style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">Нет доступных заказов</div>
                <div style="font-size: 14px; color: #8e8e93; margin-bottom: 25px;">Нажмите кнопку ниже чтобы получить новые</div>
                <button class="action-btn" onclick="loadOrders()" style="max-width: 220px; margin: 0 auto;">
                    🔄 Получить новые заказы
                </button>
            </div>
        `;
        return;
    }
    
    let filteredOrders = [...orders];
    switch(currentFilter) {
        case 'cheap':
            filteredOrders = orders.filter(o => o.price < 30);
            break;
        case 'expensive':
            filteredOrders = orders.filter(o => o.price >= 50);
            break;
        case 'vip':
            filteredOrders = orders.filter(o => o.is_vip === true);
            break;
    }
    
    if (filteredOrders.length === 0) {
        ordersList.innerHTML = `
            <div class="no-orders">
                <div style="font-size: 32px; margin-bottom: 10px;">🔍</div>
                <div>Заказы по фильтру не найдены</div>
            </div>
        `;
        return;
    }
    
    ordersList.innerHTML = filteredOrders.map((order, index) => {
        const canTake = canTakeOrder(order);
        
        return `
            <div class="order-card ${order.is_vip ? 'vip' : ''}" data-order-id="${index}">
                <div class="order-header">
                    <span>${order.is_vip ? '👑 VIP' : '🚖'} Заказ</span>
                    <span class="timer" data-time="45">⏱️ 45с</span>
                </div>
                <div class="order-route">
                    <div>📍 ${order.from}</div>
                    <div class="order-arrow">→</div>
                    <div>🏁 ${order.to}</div>
                </div>
                <div class="order-stats">
                    <span class="order-price">💰 ${order.price.toFixed(2)} PLN</span>
                    <span class="order-distance">📏 ${order.distance} км</span>
                    ${order.is_night ? '<span class="night-badge">🌙 Ночной</span>' : ''}
                </div>
                <button class="take-order-btn" 
                        onclick="takeOrder(${index})"
                        ${canTake ? '' : 'disabled'}>
                    ${canTake ? '✅ Взять' : '❌ Недоступно'}
                </button>
            </div>
        `;
    }).join('');
    
    startOrderTimers();
}

// ============= ПРОВЕРКА ВОЗМОЖНОСТИ ВЗЯТЬ ЗАКАЗ =============
function canTakeOrder(order) {
    if (!userData) return false;
    if (userData.stamina <= 0) return false;
    if (!userData.fuel_consumption) return false;
    
    const fuelNeeded = (userData.fuel_consumption / 100) * order.distance;
    return userData.fuel >= fuelNeeded;
}

// ============= ВЗЯТЬ ЗАКАЗ =============
async function takeOrder(orderIndex) {
    const order = orders[orderIndex];
    
    if (!order) {
        showNotification('❌ Заказ не найден', 'error');
        return;
    }
    
    if (!canTakeOrder(order)) {
        showNotification('❌ Недостаточно топлива или выносливости!', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}/ride`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order, useGas: false })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка выполнения заказа');
        }
        
        const result = await response.json();
        
        if (result.success) {
            userData.balance = result.new_balance;
            userData.fuel = result.new_fuel;
            userData.gas_fuel = result.new_gas_fuel || userData.gas_fuel || 0;
            userData.stamina = result.stamina;
            userData.rides_completed = (userData.rides_completed || 0) + 1;
            userData.rating = result.rating || userData.rating;
            userData.level = result.level || userData.level;
            userData.experience = result.experience || userData.experience;
            
            // Показываем достижения
            if (result.new_achievements && result.new_achievements.length > 0) {
                result.new_achievements.forEach(ach => {
                    showAchievement(ach);
                });
            }
            
            // Показываем событие
            if (result.event) {
                showNotification(`${result.event.message}`, 'info');
            }
            
            orders.splice(orderIndex, 1);
            
            updateMainScreen();
            displayOrders();
            
            // Автозагрузка при нехватке заказов
            if (orders.length < 2) {
                setTimeout(() => loadOrders(), 1500);
            }
            
            showNotification(`✅ Заказ выполнен! +${result.earnings.toFixed(2)} PLN`, 'success');
        }
        
    } catch (error) {
        console.error('Error:', error);
        showNotification(error.message, 'error');
    }
}

// ============= ЗАПРАВКА ТОПЛИВА =============
async function refuel() {
    console.log('🔵 refuel() вызвана');
    
    const litersInput = document.getElementById('fuel-range');
    const activeTypeBtn = document.querySelector('.fuel-type-btn.active');
    
    if (!litersInput) {
        console.error('❌ fuel-range не найден');
        showNotification('❌ Ошибка интерфейса', 'error');
        return;
    }
    
    if (!activeTypeBtn) {
        console.error('❌ activeTypeBtn не найден');
        showNotification('❌ Выберите тип топлива', 'error');
        return;
    }
    
    const liters = parseInt(litersInput.value) || 0;
    const fuelType = activeTypeBtn.dataset.type || 'petrol';
    
    console.log('📊 Параметры:', { liters, fuelType, userData });
    
    if (isNaN(liters) || liters <= 0) {
        showNotification('❌ Выберите количество литров', 'error');
        return;
    }
    
    if (fuelType === 'gas' && !userData?.has_gas) {
        showNotification('❌ У вашей машины нет ГБО', 'error');
        return;
    }
    
    const maxFuel = userData?.max_fuel || 45;
    const currentFuel = userData?.fuel || 0;
    const maxFill = maxFuel - currentFuel;
    
    if (liters > maxFill) {
        showNotification(`❌ Можно залить не больше ${maxFill} л`, 'error');
        return;
    }
    
    try {
        console.log('📡 Отправка запроса...');
        
        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}/fuel`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ liters, type: fuelType })
        });
        
        console.log('📡 Статус:', response.status);
        
        const result = await response.json();
        console.log('📡 Результат:', result);
        
        if (response.ok && result.success) {
            userData.balance = result.new_balance || userData.balance;
            userData.fuel = result.new_fuel !== undefined ? result.new_fuel : userData.fuel;
            userData.gas_fuel = result.new_gas_fuel !== undefined ? result.new_gas_fuel : (userData.gas_fuel || 0);
            
            updateMainScreen();
            updateFuelScreen();
            
            showNotification(result.message || `✅ Заправлено ${result.liters_added} л`, 'success');
            
            setTimeout(() => showScreen('main'), 1500);
        } else {
            showNotification(result.error || '❌ Ошибка заправки', 'error');
        }
        
    } catch (error) {
        console.error('❌ Ошибка:', error);
        showNotification('❌ Ошибка соединения с сервером', 'error');
    }
}

// ============= ОБНОВЛЕНИЕ ГЛАВНОГО ЭКРАНА =============
function updateMainScreen() {
    if (!userData) return;
    
    const elements = {
        balance: document.getElementById('balance'),
        carModel: document.getElementById('car-model'),
        fuel: document.getElementById('fuel'),
        maxFuel: document.getElementById('max-fuel'),
        stamina: document.getElementById('stamina'),
        level: document.getElementById('level'),
        ridesToday: document.getElementById('rides-today'),
        ridesStreak: document.getElementById('rides-streak'),
        ridesTotal: document.getElementById('rides-total')
    };
    
    if (elements.balance) elements.balance.textContent = userData.balance?.toFixed(2) || '0.00';
    if (elements.carModel) elements.carModel.textContent = userData.car?.name || userData.car || '🚗 Неизвестно';
    if (elements.fuel) elements.fuel.textContent = userData.fuel?.toFixed(1) || '0.0';
    if (elements.maxFuel) elements.maxFuel.textContent = userData.max_fuel || '45';
    if (elements.stamina) elements.stamina.textContent = Math.floor(userData.stamina || 0);
    if (elements.level) elements.level.textContent = `Ур. ${userData.level || 1}`;
    if (elements.ridesToday) elements.ridesToday.textContent = userData.rides_today || '0';
    if (elements.ridesStreak) elements.ridesStreak.textContent = userData.rides_streak || '0';
    if (elements.ridesTotal) elements.ridesTotal.textContent = userData.rides_completed || '0';
    
    // Топливо
    const fuelFill = document.getElementById('fuel-fill');
    if (fuelFill && userData.fuel !== undefined && userData.max_fuel) {
        const fuelPercent = (userData.fuel / userData.max_fuel) * 100;
        fuelFill.style.width = `${Math.min(100, fuelPercent)}%`;
    }
    
    // Выносливость
    const staminaFill = document.getElementById('stamina-fill');
    if (staminaFill && userData.stamina !== undefined) {
        staminaFill.style.width = `${Math.min(100, userData.stamina)}%`;
    }
    
    // Газ (если есть)
    const gasStat = document.getElementById('gas-stat');
    const gasBarContainer = document.getElementById('gas-bar-container');
    const gasFuel = document.getElementById('gas-fuel');
    const gasMaxFuel = document.getElementById('gas-max-fuel');
    const gasFill = document.getElementById('gas-fill');
    
    if (userData.has_gas) {
        if (gasStat) gasStat.style.display = 'flex';
        if (gasBarContainer) gasBarContainer.style.display = 'block';
        if (gasFuel) gasFuel.textContent = (userData.gas_fuel || 0).toFixed(1);
        if (gasMaxFuel) gasMaxFuel.textContent = userData.gas_max_fuel || '0';
        if (gasFill && userData.gas_max_fuel) {
            const gasPercent = (userData.gas_fuel / userData.gas_max_fuel) * 100;
            gasFill.style.width = `${Math.min(100, gasPercent)}%`;
        }
    } else {
        if (gasStat) gasStat.style.display = 'none';
        if (gasBarContainer) gasBarContainer.style.display = 'none';
    }
}

// ============= ОБНОВЛЕНИЕ ЭКРАНА ЗАПРАВКИ =============
function updateFuelScreen() {
    if (!userData) return;
    
    const elements = {
        currentFuel: document.getElementById('current-fuel'),
        maxFuelDisplay: document.getElementById('max-fuel-display'),
        fuelBalance: document.getElementById('fuel-balance'),
        fuelRange: document.getElementById('fuel-range'),
        gasBtn: document.querySelector('.fuel-type-btn[data-type="gas"]')
    };
    
    if (elements.currentFuel) elements.currentFuel.textContent = userData.fuel?.toFixed(1) || '0.0';
    if (elements.maxFuelDisplay) elements.maxFuelDisplay.textContent = userData.max_fuel || '45';
    if (elements.fuelBalance) elements.fuelBalance.textContent = userData.balance?.toFixed(2) || '0.00';
    
    if (elements.gasBtn) {
        elements.gasBtn.style.display = userData.has_gas ? 'inline-block' : 'none';
    }
    
    if (elements.fuelRange) {
        const maxFill = Math.max(0, (userData.max_fuel || 45) - (userData.fuel || 0));
        elements.fuelRange.max = Math.ceil(maxFill);
        elements.fuelRange.value = 0;
        elements.fuelRange.disabled = maxFill <= 0;
    }
    
    updateFuelCost();
}

// ============= ОБНОВЛЕНИЕ СТОИМОСТИ ЗАПРАВКИ =============
function updateFuelCost() {
    const litersInput = document.getElementById('fuel-range');
    const activeTypeBtn = document.querySelector('.fuel-type-btn.active');
    
    if (!litersInput || !activeTypeBtn) return;
    
    const liters = parseFloat(litersInput.value) || 0;
    const fuelType = activeTypeBtn.dataset.type || 'petrol';
    const pricePerLiter = fuelType === 'gas' ? 3.60 : 6.80;
    const cost = (liters * pricePerLiter).toFixed(2);
    
    const elements = {
        fuelLiters: document.getElementById('fuel-liters'),
        fuelCost: document.getElementById('fuel-cost')
    };
    
    if (elements.fuelLiters) elements.fuelLiters.textContent = liters.toFixed(1);
    if (elements.fuelCost) elements.fuelCost.textContent = cost;
}

// ============= ОБНОВЛЕНИЕ ЭКРАНА ГАРАЖА =============
function updateGarageScreen() {
    if (!userData) return;
    
    const elements = {
        carModel: document.getElementById('garage-car-model'),
        carStatus: document.getElementById('car-status')
    };
    
    if (elements.carModel) {
        elements.carModel.textContent = userData.car?.name || '🚗 Неизвестно';
    }
    
    if (elements.carStatus && userData.car) {
        if (userData.car.is_owned) {
            elements.carStatus.innerHTML = '✅ В собственности (без аренды)';
            elements.carStatus.style.color = '#34C759';
        } else {
            const rentPrice = userData.car.rent_price || 'н/д';
            elements.carStatus.innerHTML = `📋 Аренда: ${rentPrice} PLN/нед`;
            elements.carStatus.style.color = '#FF9500';
        }
    }
    
    loadAvailableCars();
}

// ============= ЗАГРУЗКА ДОСТУПНЫХ МАШИН =============
async function loadAvailableCars() {
    try {
        console.log('Загрузка списка машин...');
        
        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}/available-cars`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const cars = await response.json();
        console.log('Получены машины:', cars);
        
        if (!Array.isArray(cars)) {
            console.error('Сервер вернул не массив:', cars);
            return;
        }
        
        const rentalCars = cars.filter(car => car.rent_price && car.rent_price > 0 && !car.is_owned);
        const purchaseCars = cars.filter(car => car.purchase_price && car.purchase_price > 0);
        
        // Машины для аренды
        const rentalList = document.getElementById('rental-cars-list');
        if (rentalList) {
            if (rentalCars.length === 0) {
                rentalList.innerHTML = '<div class="no-cars">🚗 Нет машин для аренды</div>';
            } else {
                rentalList.innerHTML = rentalCars.map(car => `
                    <div class="car-card">
                        <div class="car-card-header">
                            <span class="car-icon">${car.image || '🚗'}</span>
                            <span class="car-name">${car.name || 'Неизвестно'}</span>
                        </div>
                        <div class="car-specs">
                            <div>💰 Аренда: ${car.rent_price} PLN/нед</div>
                            <div>⛽ Расход: ${car.fuel_consumption || '?'} л/100км</div>
                            <div>🛢️ Бак: ${car.tank_capacity || '?'} л</div>
                            ${car.has_gas ? '<div class="gas-badge">🔵 ГБО</div>' : ''}
                        </div>
                        <div class="car-description">${car.description || ''}</div>
                        <button class="rent-car-btn" onclick="rentCar('${car.id}')">
                            Арендовать (${car.rent_price} PLN/нед)
                        </button>
                    </div>
                `).join('');
            }
        }
        
        // Машины для покупки
        const purchaseList = document.getElementById('purchase-cars-list');
        if (purchaseList) {
            if (purchaseCars.length === 0) {
                purchaseList.innerHTML = '<div class="no-cars">💰 Нет машин для покупки</div>';
            } else {
                purchaseList.innerHTML = purchaseCars.map(car => `
                    <div class="car-card">
                        <div class="car-card-header">
                            <span class="car-icon">${car.image || '🚗'}</span>
                            <span class="car-name">${car.name || 'Неизвестно'}</span>
                        </div>
                        <div class="car-specs">
                            <div>💰 Цена: ${car.purchase_price} PLN</div>
                            <div>⛽ Расход: ${car.fuel_consumption || '?'} л/100км</div>
                            <div>🛢️ Бак: ${car.tank_capacity || '?'} л</div>
                            ${car.has_gas ? '<div class="gas-badge">🔵 ГБО</div>' : ''}
                        </div>
                        <div class="car-description">${car.description || ''}</div>
                        <button class="buy-car-btn" onclick="buyCar('${car.id}')">
                            Купить за ${car.purchase_price} PLN
                        </button>
                    </div>
                `).join('');
            }
        }
        
    } catch (error) {
        console.error('Ошибка загрузки машин:', error);
    }
}

// ============= АРЕНДА МАШИНЫ =============
async function rentCar(carId) {
    try {
        console.log('Аренда машины:', carId);
        
        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}/rent-car`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ carId })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            userData.car = result.new_car;
            userData.balance = result.new_balance;
            userData.fuel = result.new_fuel || userData.fuel;
            
            updateMainScreen();
            updateGarageScreen();
            showNotification(result.message, 'success');
        } else {
            showNotification(result.error || '❌ Ошибка аренды', 'error');
        }
        
    } catch (error) {
        console.error('Error renting car:', error);
        showNotification('❌ Ошибка соединения', 'error');
    }
}

// ============= ПОКУПКА МАШИНЫ =============
async function buyCar(carId) {
    try {
        console.log('Покупка машины:', carId);
        
        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}/buy-car`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ carId })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            userData.car = result.new_car;
            userData.balance = result.new_balance;
            userData.fuel = result.new_fuel || userData.fuel;
            
            updateMainScreen();
            updateGarageScreen();
            showNotification(result.message, 'success');
        } else {
            showNotification(result.error || '❌ Ошибка покупки', 'error');
        }
        
    } catch (error) {
        console.error('Error buying car:', error);
        showNotification('❌ Ошибка соединения', 'error');
    }
}

// ============= ОБНОВЛЕНИЕ ИНФОРМАЦИИ О ПАРТНЁРЕ =============
function updatePartnerInfo() {
    if (!userData) return;
    
    const elements = {
        partnerName: document.getElementById('partner-name'),
        partnerDetails: document.getElementById('partner-details'),
        ridesToNext: document.getElementById('rides-to-next'),
        progressFill: document.getElementById('partner-progress-fill')
    };
    
    const currentPartner = PARTNERS.find(p => p.id === userData.partner_id) || PARTNERS[0];
    
    if (elements.partnerName) {
        elements.partnerName.textContent = currentPartner.name;
    }
    
    if (elements.partnerDetails) {
        let details = [];
        if (currentPartner.provides_car) details.push('🚗 их машина');
        else details.push('🚗 ваша машина');
        
        if (currentPartner.fuel_provided) details.push('⛽ их топливо');
        else details.push('⛽ ваше топливо');
        
        const playerShare = Math.round((1 - currentPartner.revenue_split) * 100);
        const partnerShare = Math.round(currentPartner.revenue_split * 100);
        details.push(`${playerShare}/${partnerShare}`);
        
        elements.partnerDetails.innerHTML = details.map(d => `<span>${d}</span>`).join('');
    }
    
    // Поиск следующего партнёра
    const nextPartner = PARTNERS.find(p => 
        p.requirements.rides > (userData.rides_completed || 0) &&
        p.id > (userData.partner_id || 1)
    );
    
    if (nextPartner && elements.ridesToNext) {
        const ridesNeeded = nextPartner.requirements.rides - (userData.rides_completed || 0);
        elements.ridesToNext.textContent = `${ridesNeeded} заказов до ${nextPartner.name}`;
        
        if (elements.progressFill) {
            const currentRequirement = currentPartner.requirements.rides;
            const nextRequirement = nextPartner.requirements.rides;
            const totalRange = nextRequirement - currentRequirement;
            const currentProgress = (userData.rides_completed || 0) - currentRequirement;
            const percent = Math.min(100, Math.max(0, (currentProgress / totalRange) * 100));
            elements.progressFill.style.width = `${percent}%`;
        }
    } else if (elements.ridesToNext) {
        elements.ridesToNext.textContent = '👑 Максимальный уровень!';
        if (elements.progressFill) elements.progressFill.style.width = '100%';
    }
}

// ============= СПИСОК ПАРТНЁРОВ =============
function showPartnersList() {
    if (!userData) {
        showNotification('❌ Данные не загружены', 'error');
        return;
    }
    
    const partnersList = document.getElementById('partners-list');
    if (!partnersList) {
        console.error('❌ partners-list не найден');
        return;
    }
    
    const currentPartnerId = userData.partner_id || 1;
    
    partnersList.innerHTML = PARTNERS.map(partner => {
        const isCurrent = partner.id === currentPartnerId;
        const canSwitch = partner.requirements.rides <= (userData.rides_completed || 0);
        const ridesNeeded = Math.max(0, partner.requirements.rides - (userData.rides_completed || 0));
        
        return `
            <div class="partner-card ${isCurrent ? 'current' : ''}" data-partner-id="${partner.id}">
                <div class="partner-header">
                    <h3>${partner.name}</h3>
                    ${isCurrent ? '<span class="current-badge">✅ Текущий</span>' : ''}
                </div>
                <div class="partner-description">${partner.description}</div>
                <div class="partner-stats">
                    <div>📊 Раскрытие: ${Math.round((1 - partner.revenue_split) * 100)}/${Math.round(partner.revenue_split * 100)}</div>
                    <div>💰 Еженедельно: ${partner.weekly_cost} PLN</div>
                    ${partner.bonus_orders ? `<div>🎁 Бонус ��аказов: +${Math.round((partner.bonus_orders - 1) * 100)}%</div>` : ''}
                    ${partner.vip_orders ? '<div>👑 VIP заказы: ✅</div>' : ''}
                </div>
                <div class="partner-requirement">
                    ${!canSwitch ? `Нужно ещё ${ridesNeeded} заказов` : 'Доступен!'}
                </div>
                ${!isCurrent ? `
                    <button class="switch-partner-btn" 
                            onclick="changePartner(${partner.id})"
                            ${canSwitch ? '' : 'disabled'}>
                        ${canSwitch ? 'Перейти на' : 'Недоступен'} ${partner.name}
                    </button>
                ` : '<button class="switch-partner-btn" disabled>Текущий партнёр</button>'}
            </div>
        `;
    }).join('');
    
    showScreen('partners');
}

// ============= СМЕНА ПАРТНЁРА =============
async function changePartner(partnerId) {
    try {
        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}/partner`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            userData.partner_id = partnerId;
            showNotification(result.message || '✅ Партнёр изменён', 'success');
            updatePartnerInfo();
            showPartnersList();
        } else {
            showNotification(result.error || '❌ Ошибка', 'error');
        }
        
    } catch (error) {
        console.error('Error:', error);
        showNotification('❌ Ошибка соединения', 'error');
    }
}

// ============= ОТДЫХ С ПОДСЧЁТОМ ДНЕЙ =============
async function rest() {
    try {
        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}/rest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            userData.stamina = result.stamina;
            userData.rides_streak = 0;
            userData.balance = result.new_balance;
            userData.days_passed = result.days_passed;
            userData.week_days = result.week_days;
            userData.weeks_passed = result.weeks_passed;
            
            updateMainScreen();
            
            // Главное уведомление
            showNotification(result.message, result.week_completed ? 'warning' : 'success');
            
            // Статистика дней/недель
            showDayStatistic(result.days_passed, result.week_days, result.weeks_passed, result.week_completed);
            
        } else {
            showNotification('❌ Ошибка отдыха', 'error');
        }
        
    } catch (error) {
        console.error('Error:', error);
        showNotification('❌ Ошибка соединения', 'error');
    }
}

// ============= ПОКАЗАТЬ СТАТИСТИКУ ДНЕЙ =============
function showDayStatistic(days, weekDays, weeks, weekCompleted) {
    const popup = document.createElement('div');
    popup.className = 'day-statistic-popup';
    
    let weekBar = '';
    for (let i = 0; i < 7; i++) {
        const filled = i < weekDays ? 'filled' : '';
        weekBar += `<div class="week-day ${filled}"></div>`;
    }
    
    popup.innerHTML = `
        <div class="day-stat-content">
            <div class="stat-title">📊 Статистика игрового времени</div>
            
            <div class="stat-row">
                <span class="stat-label">📅 Всего дней:</span>
                <span class="stat-value">${days}</span>
            </div>
            
            <div class="stat-row">
                <span class="stat-label">📈 Недель:</span>
                <span class="stat-value">${weeks}</span>
            </div>
            
            <div class="week-progress">
                <div class="week-label">Прогресс недели:</div>
                <div class="week-bar">
                    ${weekBar}
                </div>
                <div class="week-counter">${weekDays}/7</div>
            </div>
            
            ${weekCompleted ? `
                <div class="week-completed-badge">
                    ✅ Неделя завершена!
                    <br><span style="font-size: 12px;">Снята еженедельная плата</span>
                </div>
            ` : ''}
        </div>
    `;
    
    document.body.appendChild(popup);
    
    setTimeout(() => {
        popup.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => popup.remove(), 300);
    }, 4500);
}

// ============= ТАЙМЕРЫ ЗАКАЗОВ =============
function startOrderTimers() {
    const orderCards = document.querySelectorAll('.order-card');
    
    orderCards.forEach((card, cardIndex) => {
        const timerSpan = card.querySelector('.timer');
        if (!timerSpan) return;
        
        let timeLeft = 45;
        
        const timer = setInterval(() => {
            timeLeft--;
            if (timerSpan) {
                timerSpan.innerHTML = `⏱️ ${timeLeft}с`;
            }
            
            if (timeLeft <= 0) {
                clearInterval(timer);
                card.classList.add('order-expired');
                setTimeout(() => {
                    orders.splice(cardIndex, 1);
                    displayOrders();
                }, 500);
            }
        }, 1000);
        
        orderTimers.push(timer);
    });
}

// ============= УВЕДОМЛЕНИЯ =============
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';
    
    notification.innerHTML = `${icon} ${message}`;
    notification.style.animation = 'slideInRight 0.3s ease-out';
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ============= ДОСТИЖЕНИЯ =============
function showAchievement(achievement) {
    const popup = document.createElement('div');
    popup.className = 'achievement-popup';
    popup.innerHTML = `
        <div class="achievement-icon">${achievement.icon || '🎉'}</div>
        <div class="achievement-text">
            <div class="achievement-title">🏆 Достижение!</div>
            <div class="achievement-name">${achievement.name}</div>
            <div class="achievement-desc">${achievement.desc}</div>
            <div class="achievement-reward">+${achievement.reward} PLN</div>
        </div>
    `;
    
    document.body.appendChild(popup);
    
    setTimeout(() => {
        popup.remove();
    }, 4000);
}

// ============= НАВИГАЦИЯ =============
function showScreen(screenName) {
    Object.entries(screens).forEach(([name, screen]) => {
        if (screen) {
            screen.classList.remove('active');
        }
    });
    
    if (screens[screenName]) {
        screens[screenName].classList.add('active');
    } else {
        console.warn(`Screen '${screenName}' not found`);
        return;
    }
    
    if (tg && tg.version >= '6.1') {
        if (screenName === 'main') {
            tg.BackButton.hide();
        } else {
            tg.BackButton.show();
        }
    }
    
    if (screenName === 'orders') {
        loadOrders();
    } else if (screenName === 'fuel') {
        updateFuelScreen();
    } else if (screenName === 'garage') {
        updateGarageScreen();
    } else if (screenName === 'partners') {
        // Список партнёров уже загружен в showPartnersList
    }
}

// ============= ОБРАБОТЧИКИ СОБЫТИЙ =============
function setupEventListeners() {
    console.log('🔄 Настройка обработчиков...');
    
    // Главное меню
    const buttons = {
        'online-btn': () => showScreen('orders'),
        'fuel-btn': () => showScreen('fuel'),
        'garage-btn': () => showScreen('garage'),
        'rest-btn': rest,
        'show-partners-btn': showPartnersList
    };
    
    Object.entries(buttons).forEach(([id, handler]) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', handler);
            console.log(`✅ ${id} привязана`);
        }
    });
    
    // Кнопки назад
    const backButtons = {
        'back-from-orders': 'main',
        'back-from-fuel': 'main',
        'back-from-garage': 'main',
        'back-from-partners': 'main'
    };
    
    Object.entries(backButtons).forEach(([id, screenName]) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => showScreen(screenName));
        }
    });
    
    // Telegram BackButton
    if (tg && tg.version >= '6.1') {
        tg.BackButton.onClick(() => showScreen('main'));
    }
    
    // Заправка
    const fuelRange = document.getElementById('fuel-range');
    if (fuelRange) {
        fuelRange.addEventListener('input', updateFuelCost);
    }
    
    const refuelBtn = document.getElementById('refuel-btn');
    if (refuelBtn) {
        refuelBtn.addEventListener('click', refuel);
        console.log('✅ Кнопка заправки привязана');
    }
    
    // Пресеты заправки
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const liters = parseInt(btn.dataset.liters);
            const range = document.getElementById('fuel-range');
            if (range) {
                range.value = Math.min(liters, range.max || 100);
                updateFuelCost();
            }
        });
    });
    
    // Выбор типа топлива
    document.querySelectorAll('.fuel-type-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.fuel-type-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            updateFuelCost();
        });
    });
    
    // Фильтры заказов
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter || 'all';
            displayOrders();
        });
    });
    
    console.log('✅ Все обработчики настроены');
}

// ============= ЗАПУСК ПРИЛОЖЕНИЯ =============
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}