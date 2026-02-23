// ============= ГЛОБАЛЬНЫЙ ОБРАБОТЧИК ОШИБОК =============
window.onerror = function (message, source, lineno, colno, error) {
    console.error('Global Error:', message, error);

    const container = document.getElementById('notification-container');
    if (container) {
        const div = document.createElement('div');
        div.className = 'notification error push-error';
        const stack = error?.stack || `At ${source}:${lineno}:${colno}`;
        div.innerHTML = `
            <div class="notif-content">
                <span>⚠️ Системная ошибка</span>
                <button onclick="sendErrorReport('${message.toString().replace(/'/g, "\\'")}', '${stack.replace(/'/g, "\\'")}', 'global-error')">Отправить отчет</button>
            </div>
            <span class="close-notif" onclick="this.parentElement.remove()">&times;</span>
        `;
        container.appendChild(div);
        setTimeout(() => div.classList.add('show'), 100);
    }
    return false;
};

async function sendErrorReport(msg, stack, screen = 'dynamic-notif') {
    try {
        await fetch(`${API_BASE_URL}/error-report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: msg,
                stack: stack,
                telegramId: TELEGRAM_ID,
                screen: screen,
                url: window.location.href,
                timestamp: new Date().toISOString()
            })
        });
        showNotification('✅ Отчет отправлен. Спасибо!', 'success');
        document.querySelector('.push-error')?.remove();
    } catch (e) {
        showNotification('❌ Не удалось отправить отчет', 'error');
    }
}

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
let currentDistrict = 'suburbs';
let districts = [];
let staminaInterval = null;
let eventInterval = null;

// ============= КОНФИГУРАЦИЯ =============
const API_BASE_URL = window.location.origin + '/api';
const TELEGRAM_ID = tg?.initDataUnsafe?.user?.id || 'test_user_123';
const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjE2IiBmaWxsPSIjNjY2Ij7VfDwvdGV4dD48L3N2Zz4=';
let PLAYER_AVATAR = tg?.initDataUnsafe?.user?.photo_url || DEFAULT_AVATAR;
let PLAYER_NAME = tg?.initDataUnsafe?.user?.first_name || 'Таксист';

// ============= ПАРТНЁРЫ =============
const PARTNERS = [
    {
        id: 1,
        name: '👤 Начинающий',
        description: 'Делим 50/50, их машина, их топливо',
        revenue_split: 0.5,
        provides_car: true,
        fuel_provided: false,
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
    partners: document.getElementById('partners-screen'),
    casino: document.getElementById('casino-screen'),
    lootbox: document.getElementById('lootbox-screen'),
    containers: document.getElementById('containers-screen'),
    profile: document.getElementById('profile-modal')
};

// ============= v2.5: ПРОМОКОДЫ =============
function setupPromoListeners() {
    const promoBtn = document.getElementById('promo-open-btn');
    const closeBtn = document.getElementById('close-promo-modal');
    const redeemBtn = document.getElementById('redeem-promo-btn');
    const modal = document.getElementById('promo-modal');

    promoBtn?.addEventListener('click', () => {
        modal.style.display = 'block';
        document.getElementById('promo-result').textContent = '';
        document.getElementById('promo-input').value = '';
        try { soundManager.play('button'); } catch (e) { }
    });

    closeBtn?.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    redeemBtn?.addEventListener('click', redeemPromo);
}

// ============= v2.6: ОБЪЯВЛЕНИЯ =============
function setupAnnouncementListeners() {
    const closeBtn = document.getElementById('close-ann-modal');
    const closeBtn2 = document.getElementById('close-ann-btn');
    const modal = document.getElementById('ann-modal');

    const close = () => {
        modal.style.display = 'none';
        try { soundManager.play('button'); } catch (e) { }
    };

    closeBtn?.addEventListener('click', close);
    closeBtn2?.addEventListener('click', close);
}

// ============= v2.7: ГАИ / ШТРАФЫ =============
function setupPoliceListeners() {
    document.getElementById('police-pay-btn')?.addEventListener('click', () => settlePoliceEncounter('pay'));
    document.getElementById('police-bribe-btn')?.addEventListener('click', () => settlePoliceEncounter('bribe'));
    document.getElementById('police-close-btn')?.addEventListener('click', () => {
        document.getElementById('police-modal').style.display = 'none';
        try { soundManager.play('button'); } catch (e) { }
    });
}

function handlePoliceEncounter(fine) {
    const modal = document.getElementById('police-modal');
    const message = document.getElementById('police-message');
    const actions = document.getElementById('police-actions');
    const resultDiv = document.getElementById('police-result');
    const closeBtn = document.getElementById('police-close-btn');

    modal.style.display = 'flex';
    message.textContent = `👮 Вас остановил патруль ГАИ! Штраф: ${fine} PLN. Что будете делать?`;
    actions.style.display = 'flex';
    resultDiv.style.display = 'none';
    closeBtn.style.display = 'none';

    try { soundManager.play('siren'); } catch (e) { } // We should add this sound or fallback
}

async function settlePoliceEncounter(action) {
    try {
        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}/police/settle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        });

        const result = await response.json();

        if (result.success) {
            userData.balance = result.new_balance;
            updateMainScreen();

            const resultDiv = document.getElementById('police-result');
            const actions = document.getElementById('police-actions');
            const closeBtn = document.getElementById('police-close-btn');

            actions.style.display = 'none';
            resultDiv.style.display = 'block';
            resultDiv.textContent = result.message;
            resultDiv.style.color = (result.outcome === 'fail') ? '#ff3b30' : '#34C759';
            closeBtn.style.display = 'block';

            if (result.outcome === 'fail' || action === 'pay') {
                try { soundManager.play('error'); } catch (e) { }
            } else {
                try { soundManager.play('success'); } catch (e) { }
            }
        }
    } catch (e) {
        console.error('Police settle error:', e);
        showNotification('Ошибка связи с ГАИ', 'error');
    }
}

async function checkAnnouncements() {
    try {
        const res = await fetch(`${API_BASE_URL}/announcement`);
        const data = await res.json();

        if (data.active) {
            document.getElementById('game-ann-title').textContent = data.data.title;
            document.getElementById('game-ann-message').textContent = data.data.message;

            const header = document.getElementById('ann-header');
            const colors = {
                info: '#0088cc',
                success: '#34b545',
                warning: '#f39c12',
                error: '#e74c3c'
            };
            if (header) header.style.borderBottom = `2px solid ${colors[data.data.type] || '#0088cc'}`;

            document.getElementById('ann-modal').style.display = 'block';
        }
    } catch (e) {
        console.error('Announcements error:', e);
    }
}

async function redeemPromo() {
    const code = document.getElementById('promo-input').value.trim();
    const resultDiv = document.getElementById('promo-result');

    if (!code) return;

    try {
        const response = await fetch(`${API_BASE_URL}/promo/redeem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: TELEGRAM_ID, code })
        });

        const data = await response.json();

        if (response.ok) {
            resultDiv.style.color = '#34b545';
            resultDiv.textContent = '✅ Промокод активирован!';
            try { soundManager.play('success'); } catch (e) { }

            // Show reward info
            let rewardText = '';
            if (data.reward.balance) rewardText += `+${data.reward.balance} PLN `;
            if (data.reward.lootboxes) rewardText += `+Сундуки`;
            showNotification(`🎁 Награда: ${rewardText}`, 'success');

            loadUserData(); // Refresh stats
            setTimeout(() => { document.getElementById('promo-modal').style.display = 'none'; }, 2000);
        } else {
            resultDiv.style.color = '#ff3b30';
            resultDiv.textContent = data.error || 'Ошибка активации';
            try { soundManager.play('error'); } catch (e) { }
        }
    } catch (e) {
        resultDiv.textContent = 'Ошика сервера';
    }
}

function checkMaintenance(status) {
    if (status === 503) {
        document.getElementById('maintenance-overlay').style.display = 'flex';
        return true;
    }
    return false;
}

// ============= ВЫЗОВ ПРИ ЗАГРУЗКЕ =============
// Удалены дублирующие вызовы, инициализация происходит в конце файла

// ============= ИНИЦИАЛИЗАЦИЯ =============
async function initApp() {
    const splash = document.getElementById('splash-screen');
    const status = document.getElementById('splash-status');
    const progressFill = document.getElementById('splash-progress-fill');
    const percentEl = document.getElementById('splash-percent');
    const tipEl = document.getElementById('splash-tip');

    const tips = [
        '💡 Совет: Заправляйтесь газом — он дешевле бензина!',
        '💡 Совет: Ночные заказы приносят больше денег!',
        '💡 Совет: Следите за состоянием машины!',
        '💡 Совет: Повышайте навыки для лучших заказов!',
        '💡 Совет: Участвуйте в аукционах контейнеров!',
        '💡 Совет: Серия заказов даёт бонусы к оплате!',
        '💡 Совет: Промокоды дают бесплатные бонусы!'
    ];

    if (tipEl) tipEl.textContent = tips[Math.floor(Math.random() * tips.length)];

    // v3.0: Splash online count
    const fetchOnline = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/online-count`);
            const data = await res.json();
            const el = document.getElementById('splash-online-count');
            if (el) el.textContent = data.count;
        } catch (e) { }
    };
    fetchOnline();
    setInterval(fetchOnline, 30000);

    function updateProgress(percent, text) {
        if (progressFill) progressFill.style.width = percent + '%';
        if (percentEl) percentEl.textContent = percent + '%';
        if (status) status.textContent = text;
        console.log(`[INIT] ${percent}%: ${text}`);
    }

    try {
        console.log('🚀 Инициализация приложения...');
        updateProgress(10, 'Подключение к серверу...');
        await new Promise(r => setTimeout(r, 400));

        updateProgress(20, 'Загрузка профиля игрока...');
        await loadUserData();

        updateProgress(50, 'Загрузка игровых данных...');
        await new Promise(r => setTimeout(r, 500));

        updateProgress(65, 'Проверка объявлений...');
        await checkAnnouncements();

        updateProgress(80, 'Настройка интерфейса...');
        await new Promise(r => setTimeout(r, 400));

        updateProgress(90, 'Проверка наград...');

        // Check for pending auction rewards
        if (typeof containersManager !== 'undefined') {
            try {
                const res = await fetch(`${API_BASE_URL}/auction/pending/${TELEGRAM_ID}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.rewards && data.rewards.length > 0) {
                        setTimeout(() => containersManager.showRewardModal(data.rewards[0], 0), 1000);
                    }
                }
            } catch (e) { console.warn('Auction rewards check failed', e); }
        }

        updateProgress(95, 'Финализация...');
        await new Promise(r => setTimeout(r, 400));

        // Start background tasks
        if (!window.dataRefreshInterval) {
            window.dataRefreshInterval = setInterval(loadUserData, 60000);
        }

        updateProgress(100, 'Готово!');
        console.log('🏁 Инициализация успешно завершена');

        // Скрываем Splash Screen
        await new Promise(r => setTimeout(r, 600));
        if (splash) {
            splash.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            splash.style.opacity = '0';
            splash.style.transform = 'scale(1.1)';
            splash.style.pointerEvents = 'none';
            setTimeout(() => {
                splash.style.display = 'none';
                console.log('👋 Splash screen removed');
            }, 600);
        }

        showNotification('🚖 Добро пожаловать в Такси Симулятор!', 'info');

        // v3.3: License Plates & Social Feed
        setupPlatesListeners();
        initStreetFeed();

        // Initialize crash status polling
        if (typeof updateCrashStatus === 'function') {
            updateCrashStatus();
            crashPollInterval = setInterval(updateCrashStatus, 5000);
        }

        console.log('🚀 App Initialized Successfully');
    } catch (error) {
        console.error('❌ Фатальная ошибка инициализации:', error);
        updateProgress(100, 'Ошибка: ' + error.message);
        if (status) status.style.color = '#ff3b30';

        // Auto-hide splash even on error after delay
        setTimeout(() => {
            if (splash) {
                splash.style.opacity = '0';
                splash.style.pointerEvents = 'none';
                setTimeout(() => { splash.style.display = 'none'; }, 600);
            }
        }, 5000);

        showNotification('❌ Ошибка инициализации: ' + error.message, 'error');
    }
}

async function updateOnlineCount() {
    try {
        const res = await fetch(`${API_BASE_URL}/online-count`);
        const data = await res.json();
        const el = document.getElementById('online-count');
        if (el) el.textContent = data.count;
    } catch (e) { }
}

// ============= ЗАГРУЗКА ДАННЫХ ПОЛЬЗОВАТЕЛЯ =============
async function loadUserData() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (checkMaintenance(response.status)) return;
        if (!response.ok) {
            throw new Error(`Ошибка сервера: ${response.status}`);
        }
        userData = await response.json();

        localStorage.setItem('userData', JSON.stringify(userData));

        updateMainScreen();
        updateFuelScreen();
        updateGarageScreen();
        updateBalanceDisplay();
        updatePlatesUI();
        if (typeof checkRetentionMilestones === 'function') checkRetentionMilestones();
        startRetentionIntervals();
    } catch (error) {
        clearTimeout(timeoutId);
        console.error('Error loading user data:', error);

        const saved = localStorage.getItem('userData');
        if (saved) {
            userData = JSON.parse(saved);
            updateMainScreen();
            updateFuelScreen();
            updateGarageScreen();
            updateBalanceDisplay();
            updatePlatesUI();
            showNotification('⚠️ Проблемы с сетью. Загружены локальные данные.', 'warning');
            if (typeof startRetentionIntervals === 'function') {
                startRetentionIntervals();
            }
        } else {
            throw error;
        }
    }
}

// ============= ЗАГРУЗКА ЗАКАЗОВ =============
async function loadOrders() {
    try {
        const ordersList = document.getElementById('orders-list');
        if (ordersList) {
            ordersList.innerHTML = '<div class="loading">⏳ Загрузка заказов...</div>';
        }

        const response = await fetch(`${API_BASE_URL}/orders/${TELEGRAM_ID}?district=${currentDistrict}`);
        if (checkMaintenance(response.status)) return;
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

// ============= v2.2: ЗАГРУЗКА РАЙОНОВ =============
async function loadDistricts() {
    try {
        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}/districts`);
        if (!response.ok) throw new Error('Failed to load districts');

        districts = await response.json();

        const selector = document.getElementById('district-selector');
        if (!selector) return;

        selector.innerHTML = districts.map(d => `
            <div class="district-card ${d.id === currentDistrict ? 'active' : ''} ${!d.unlocked ? 'locked' : ''}"
                 onclick="${d.unlocked ? `selectDistrict('${d.id}')` : ''}">
                <div class="district-name">${d.name}</div>
                <div class="district-desc">${d.description}</div>
                ${!d.unlocked ? `<div class="district-unlock">Ур. ${d.unlockLevel || '?'}${d.unlockCost ? ` / ${d.unlockCost} PLN` : ''}</div>` : ''}
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading districts:', error);
    }
}

function selectDistrict(districtId) {
    currentDistrict = districtId;
    loadDistricts();
    loadOrders();
    try { soundManager.play('button'); } catch (e) { }
}

// ============= ОТОБРАЖЕНИЕ ЗАКАЗОВ =============
function displayOrders() {
    const ordersList = document.getElementById('orders-list');
    if (!ordersList) return;

    if (!orders || orders.length === 0) {
        ordersList.innerHTML = `
            <div class="no-orders text-center fade-in">
                <div style="font-size: 60px; margin-bottom: 20px; filter: drop-shadow(0 0 10px rgba(255,160,0,0.3))">🚕</div>
                <div style="font-size: 20px; font-weight: 800; margin-bottom: 10px; color: var(--text-color)">Биржа заказов пуста</div>
                <div style="font-size: 14px; opacity: 0.6; margin-bottom: 30px;">Все клиенты уже уехали. Ожидайте новые вызовы...</div>
                <button class="menu-btn primary" onclick="loadOrders()" style="max-width: 250px; margin: 0 auto; box-shadow: 0 4px 15px rgba(0,122,255,0.4)">
                    🔄 Обновить эфир
                </button>
            </div>
        `;
        return;
    }

    let filteredOrders = [...orders];
    switch (currentFilter) {
        case 'cheap': filteredOrders = orders.filter(o => o.price < 30); break;
        case 'expensive': filteredOrders = orders.filter(o => o.price >= 50); break;
        case 'vip': filteredOrders = orders.filter(o => o.is_vip === true); break;
    }

    if (filteredOrders.length === 0) {
        ordersList.innerHTML = `<div class="no-orders">Не найдено заказов по фильтру "${currentFilter}" 🔍</div>`;
        return;
    }

    ordersList.innerHTML = filteredOrders.map((order) => {
        const canTake = canTakeOrder(order);
        const orderClass = order.class || 'economy';
        const passenger = order.passenger || { name: 'Клиент', avatar: '👤', rating: '5.0' };

        // Find current aggregator choice or use default
        const aggId = 'yodex'; // In a real app we'd track selected app
        const aggInfo = order.prices[aggId] || { price: order.price, color: '#f3a000', commission: 0.2 };

        return `
            <div class="order-card ${orderClass}" id="order-${order.id}">
                <div class="order-header">
                    <div class="passenger-meta">
                        <div class="passenger-avatar">${passenger.avatar}</div>
                        <div class="user-meta">
                            <span class="passenger-name">${passenger.name}</span>
                            <span class="passenger-rating">⭐ ${passenger.rating}</span>
                        </div>
                    </div>
                    <div class="aggregator-badge" style="background: ${aggInfo.color}33; color: ${aggInfo.color}; border-color: ${aggInfo.color}55">
                        ${aggId.toUpperCase()} • ${(aggInfo.commission * 100).toFixed(0)}%
                    </div>
                </div>

                <div class="order-route-modern">
                    <div class="route-item">
                        <span class="route-icon">📍</span>
                        <span class="route-text">${order.from}</span>
                    </div>
                    <div class="route-item" style="padding-left: 2px; border-left: 2px dashed rgba(255,255,255,0.1); margin-left: 7px; height: 15px;"></div>
                    <div class="route-item">
                        <span class="route-icon">🏁</span>
                        <span class="route-text">${order.to}</span>
                    </div>
                </div>

                <div class="order-stats">
                    <div class="stat-group">
                        <span class="stat-label">Расстояние</span>
                        <span class="stat-value">${order.distance} км</span>
                    </div>
                    <div class="stat-group">
                        <span class="stat-label">Оплата</span>
                        <span class="stat-value price">${aggInfo.price.toFixed(2)} PLN</span>
                    </div>
                    <div class="stat-group">
                         ${order.is_night ? '<span class="night-badge">🌙 Ночь</span>' : `<span class="timer" data-time="45" id="timer-${order.id}">⏱️ 45с</span>`}
                    </div>
                </div>

                <!-- TRIP ANIMATION (HIDDEN BY DEFAULT) -->
                <div class="trip-progress-container" id="trip-${order.id}">
                    <div class="trip-track">
                        <div class="trip-car-icon" id="car-${order.id}">🚕</div>
                        <div class="trip-fill" id="fill-${order.id}"></div>
                    </div>
                    <div class="trip-info">
                        <span>${order.from}</span>
                        <span>${order.to}</span>
                    </div>
                </div>

                <button class="take-order-btn" 
                        onclick="takeOrder('${order.id}', event)"
                        ${canTake ? '' : 'disabled'}>
                    ${canTake ? '✅ Принять заказ' : '❌ Нет ресурсов'}
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
async function takeOrder(orderId, event) {
    const order = orders.find(o => o.id === orderId);

    if (!order) {
        showNotification('❌ Заказ не найден', 'error');
        return;
    }

    if (!canTakeOrder(order)) {
        showNotification('❌ Недостаточно топлива или выносливости!', 'error');
        return;
    }

    const card = document.getElementById(`order-${orderId}`);
    if (card) {
        card.classList.add('in-progress');
    }

    try {
        try { soundManager.play('engine'); } catch (e) { }

        // Start animation before/during API call
        const rideDuration = 3000; // 3 seconds visual ride
        const animationPromise = animateRide(orderId, rideDuration);

        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}/ride`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: orderId, useGas: false })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка выполнения заказа');
        }

        const result = await response.json();

        // Wait for animation to finish
        await animationPromise;

        if (result.success) {
            const oldLevel = userData.level;
            userData.balance = result.new_balance;
            userData.fuel = result.new_fuel;
            userData.gas_fuel = result.new_gas_fuel || userData.gas_fuel || 0;
            userData.stamina = result.stamina;
            userData.rides_completed = (userData.rides_completed || 0) + 1;
            userData.rating = result.rating || userData.rating;
            userData.level = result.level || userData.level;
            userData.experience = result.experience || userData.experience;

            // Check for level up
            if (userData.level > oldLevel) {
                showLevelUpWow(userData.level);
            }

            // Achievements
            if (result.new_achievements && result.new_achievements.length > 0) {
                result.new_achievements.forEach(ach => showAchievement(ach));
            }

            // Events
            if (result.event) {
                if (result.event.type === 'police_stopped') {
                    handlePoliceEncounter(result.event.fine);
                    return;
                }
                showNotification(`${result.event.message}`, 'info');
            }

            // Remove order
            const idx = orders.findIndex(o => o.id === orderId);
            if (idx !== -1) orders.splice(idx, 1);

            updateMainScreen();
            displayOrders();

            if (orders.length < 2) {
                setTimeout(() => loadOrders(), 1500);
            }

            showNotification(`✅ Заказ выполнен! +${result.earnings.toFixed(2)} PLN`, 'success');
            try { soundManager.play('coin'); } catch (e) { }
        }

    } catch (error) {
        console.error('Error:', error);
        showNotification(error.message, 'error');
        if (card) card.classList.remove('in-progress');
    }
}

function animateRide(orderId, duration) {
    return new Promise((resolve) => {
        const car = document.getElementById(`car-${orderId}`);
        const fill = document.getElementById(`fill-${orderId}`);
        if (!car || !fill) {
            resolve();
            return;
        }

        let start = null;
        function step(timestamp) {
            if (!start) start = timestamp;
            const progress = (timestamp - start) / duration;
            const percent = Math.min(progress * 100, 100);

            car.style.left = `${percent}%`;
            fill.style.width = `${percent}%`;

            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                resolve();
            }
        }
        window.requestAnimationFrame(step);
    });
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
            try { soundManager.play('coin'); } catch (e) { }

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
        jackpotAmount: document.getElementById('jackpot-amount'),
        carModel: document.getElementById('car-model'),
        fuel: document.getElementById('fuel'),
        maxFuel: document.getElementById('max-fuel'),
        stamina: document.getElementById('stamina'),
        level: document.getElementById('level'),
        ridesToday: document.getElementById('rides-today'),
        ridesStreak: document.getElementById('rides-streak'),
        ridesTotal: document.getElementById('rides-total'),
        achievementsPreview: document.getElementById('achievements-preview')
    };

    if (elements.balance) elements.balance.textContent = userData.balance?.toFixed(2) || '0.00';
    if (elements.jackpotAmount && userData.jackpot_pool !== undefined) {
        elements.jackpotAmount.textContent = userData.jackpot_pool.toFixed(2);
    }
    if (elements.carModel) elements.carModel.textContent = userData.car?.name || userData.car || '🚗 Неизвестно';
    if (elements.fuel) elements.fuel.textContent = userData.fuel?.toFixed(1) || '0.0';
    if (elements.maxFuel) elements.maxFuel.textContent = userData.max_fuel || '45';
    if (elements.stamina) elements.stamina.textContent = Math.floor(userData.stamina || 0);
    if (elements.level) elements.level.textContent = `Ур. ${userData.level || 1}`;
    if (elements.ridesToday) elements.ridesToday.textContent = userData.rides_today || '0';
    if (elements.ridesStreak) {
        const streakEl = document.getElementById('rides-streak');
        if (streakEl) streakEl.textContent = userData.rides_streak || '0';
    }
    if (elements.ridesTotal) elements.ridesTotal.textContent = userData.rides_completed || '0';

    // v3.1: Profile Header Update
    const nameEl = document.getElementById('player-name');
    if (nameEl) nameEl.textContent = PLAYER_NAME;
    const avatarEl = document.getElementById('player-avatar');
    if (avatarEl) avatarEl.src = PLAYER_AVATAR;
    const levelBadge = document.getElementById('level-badge');
    if (levelBadge) levelBadge.textContent = userData.level || 1;

    // v3.3: Plate rendering on main screen
    const plateContainer = document.getElementById('main-car-plate');
    if (plateContainer && userData.car) {
        if (userData.car.plate) {
            plateContainer.innerHTML = `
                <div class="license-plate ${userData.car.plate.rarity}">
                    ${userData.car.plate.number}
                </div>
            `;
            plateContainer.style.display = 'flex';
        } else {
            plateContainer.style.display = 'none';
        }
    }

    // Mini-exp bar
    const expMiniFill = document.getElementById('exp-mini-fill');
    if (expMiniFill) {
        const expInLevel = userData.experience % 100;
        expMiniFill.style.width = `${expInLevel}%`;
    }

    // Fuel Consumption
    const fuelConsEl = document.getElementById('fuel-consumption-display');
    if (fuelConsEl && userData.car) {
        fuelConsEl.textContent = userData.car.fuel_consumption || '0.0';
    }

    // Update Profile View if it might be open
    updateProfileScreen();

    // v2.3: Update retention features
    if (typeof updateStreakDisplay === 'function') updateStreakDisplay();
    if (typeof updateStaminaTimer === 'function') updateStaminaTimer();

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
        if (gasFuel) gasFuel.textContent = Number(userData.gas_fuel || 0).toFixed(1);
        if (gasMaxFuel) gasMaxFuel.textContent = userData.gas_max_fuel || '0';
        if (gasFill && userData.gas_max_fuel) {
            const gasPercent = (Number(userData.gas_fuel || 0) / Number(userData.gas_max_fuel || 1)) * 100;
            gasFill.style.width = `${Math.min(100, gasPercent)}%`;
        }
    } else {
        if (gasStat) gasStat.style.display = 'none';
        if (gasBarContainer) gasBarContainer.style.display = 'none';
    }

    // v2.1: Car Condition
    const conditionStat = document.getElementById('condition-stat');
    const conditionValue = document.getElementById('car-condition');
    if (userData.car && userData.car.is_owned && userData.car.condition !== undefined) {
        if (conditionStat) conditionStat.style.display = 'flex';
        if (conditionValue) conditionValue.textContent = Math.floor(userData.car.condition);
    } else {
        if (conditionStat) conditionStat.style.display = 'none';
    }

    // Clear and render achievements preview
    if (elements.achievementsPreview) {
        elements.achievementsPreview.innerHTML = '';
        if (userData && userData.achievements) {
            try {
                Object.values(userData.achievements).forEach(ach => {
                    if (ach && ach.completed) {
                        const span = document.createElement('span');
                        span.className = 'achievement-mini';
                        span.textContent = ach.icon || '🏆';
                        span.title = ach.name;
                        elements.achievementsPreview.appendChild(span);
                    }
                });
            } catch (e) { console.error('Error rendering achievements:', e); }
        }
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
        carStatus: document.getElementById('car-status'),
        upgradeLevel: document.getElementById('car-upgrade-level'),
        consumption: document.getElementById('car-consumption'),
        tank: document.getElementById('car-tank')
    };

    if (elements.carModel) {
        elements.carModel.textContent = userData.car?.name || '🚗 Неизвестно';
    }

    if (elements.carStatus && userData.car) {
        if (userData.car.is_owned) {
            elements.carStatus.innerHTML = '✅ В собственности';
            elements.carStatus.style.color = '#34C759';
        } else {
            const rentPrice = userData.car.rent_price || 'н/д';
            elements.carStatus.innerHTML = `📋 Аренда: ${rentPrice} PLN/нед`;
            elements.carStatus.style.color = '#FF9500';
        }
    }

    if (elements.upgradeLevel) elements.upgradeLevel.textContent = userData.level || 1;
    if (elements.consumption) elements.consumption.textContent = userData.car?.fuel_consumption || '?';
    if (elements.tank) elements.tank.textContent = userData.car?.tank_capacity || '?';

    // v2.1: Show condition and repair button
    const garageCondition = document.getElementById('garage-car-condition');
    const garageConditionContainer = document.getElementById('garage-condition-container');
    const repairBtn = document.getElementById('repair-btn');

    if (userData.car && userData.car.is_owned) {
        if (garageConditionContainer) garageConditionContainer.style.display = 'flex';
        if (garageCondition) garageCondition.textContent = Math.floor(userData.car.condition || 100);
        if (repairBtn) {
            repairBtn.style.display = (userData.car.condition || 100) < 95 ? 'block' : 'none';
        }
    } else {
        if (garageConditionContainer) garageConditionContainer.style.display = 'none';
    }

    loadMyCars();
    loadAvailableCars();
}

// ============= ЗАГРУЗКА МОИХ МАШИН (ГАРАЖ) =============
async function loadMyCars() {
    try {
        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}/garage`);
        if (!response.ok) throw new Error('Failed to load garage');

        const myCars = await response.json();
        const businessData = userData.business || { rented_cars: {} };
        const rentedCars = businessData.rented_cars || {};

        // Ensure container exists
        let myCarsList = document.getElementById('my-cars-list');
        if (!myCarsList) {
            const currentCarCard = document.querySelector('.current-car-card') || document.querySelector('.status-card');
            if (currentCarCard) {
                myCarsList = document.createElement('div');
                myCarsList.id = 'my-cars-list';
                myCarsList.className = 'cars-list';
                myCarsList.style.marginBottom = '20px';

                const title = document.createElement('h3');
                title.textContent = '🚙 Мой автопарк';

                currentCarCard.parentNode.insertBefore(title, currentCarCard.nextSibling);
                currentCarCard.parentNode.insertBefore(myCarsList, title.nextSibling);
            }
        }

        if (myCarsList) {
            if (myCars.length === 0) {
                myCarsList.innerHTML = '<div class="no-cars">У вас пока одна машина</div>';
            } else {
                myCarsList.innerHTML = myCars.map(car => {
                    const isRented = !!rentedCars[car.id];
                    const income = car.purchase_price ? Math.floor(car.purchase_price * 0.1) : 0;

                    let actionButton = '';

                    if (car.is_selected) {
                        actionButton = '<div class="car-status-badge">✅ Текущая</div>';
                    } else if (isRented) {
                        actionButton = `
                        <div class="car-status-badge" style="background: #FF9500; color: #fff; margin-bottom: 5px; padding: 4px; border-radius: 4px;">💼 Сдана в аренду</div>
                        <div style="font-size: 12px; color: #8E8E93; margin-bottom: 5px;">Доход: ${income} PLN/нед</div>
                        <button class="action-btn" onclick="recallCar('${car.id}')" style="background: #FF3B30; width: 100%;">
                            Вернуть в гараж
                        </button>
                    `;
                    } else {
                        actionButton = `
                        <button class="action-btn" onclick="selectCar('${car.id}')" style="margin-bottom: 5px; width: 100%;">
                            Севсть за руль
                        </button>
                        ${car.purchase_price > 0 ? `
                        <button class="action-btn" onclick="rentOutCar('${car.id}')" style="background: #007AFF; width: 100%;">
                            Сдать в аренду (+${income}/нед)
                        </button>` : ''}
                    `;
                    }

                    const plateHtml = car.plate ? `
                        <div class="license-plate ${car.plate.rarity}" style="font-size: 10px; height: 18px; min-width: 60px; margin-bottom: 5px;">
                            ${car.plate.number}
                        </div>
                    ` : '';

                    return `
                <div class="car-card ${car.is_selected ? 'selected-car' : ''}" style="${car.is_selected ? 'border: 2px solid #34C759;' : ''}">
                    <div class="car-card-header">
                        <span class="car-icon">${car.image || '🚗'}</span>
                        <div style="display: flex; flex-direction: column;">
                            <span class="car-name">${car.name}</span>
                            ${plateHtml}
                        </div>
                    </div>
                    <div class="car-specs">
                        <div>⛽ ${car.fuel_consumption} л/100км</div>
                        <div>🛢️ ${car.tank_capacity} л</div>
                    </div>
                    <div style="margin-top: 10px; width: 100%;">
                        ${actionButton}
                    </div>
                </div>
            `;
                }).join('');
            }
        }

    } catch (error) {
        console.error('Error loading garage:', error);
    }
}

// ============= ФУНКЦИИ АВТОПАРКА =============
async function rentOutCar(carId) {
    try {
        if (!confirm('Сдать машину в аренду? Вы будете получать доход каждую неделю, но не сможете ездить на ней.')) return;

        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}/fleet/rent-out`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ carId })
        });

        const result = await response.json();
        if (result.success) {
            userData.business = result.business;
            showNotification(result.message, 'success');
            updateGarageScreen();
        } else {
            showNotification(result.error || 'Ошибка', 'error');
        }
    } catch (e) {
        console.error(e);
        showNotification('Ошибка сети', 'error');
    }
}

async function recallCar(carId) {
    try {
        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}/fleet/recall`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ carId })
        });

        const result = await response.json();
        if (result.success) {
            userData.business = result.business;
            showNotification(result.message, 'success');
            updateGarageScreen();
        } else {
            showNotification(result.error || 'Ошибка', 'error');
        }
    } catch (e) {
        console.error(e);
        showNotification('Ошибка сети', 'error');
    }
}

// ============= ВЫБОР МАШИНЫ =============
async function selectCar(carId) {
    try {
        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}/select-car`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ carId })
        });

        const result = await response.json();

        if (result.success) {
            userData.car = result.new_car;
            showNotification(`🚗 Вы пересели на ${result.new_car.name}`, 'success');
            updateMainScreen();
            updateGarageScreen();
        } else {
            showNotification(result.error || 'Ошибка смены машины', 'error');
        }
    } catch (error) {
        console.error('Error selecting car:', error);
        showNotification('Ошибка сети', 'error');
    }
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
                    ${partner.bonus_orders ? `<div>🎁 Бонус аказов: +${Math.round((partner.bonus_orders - 1) * 100)}%</div>` : ''}
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
        showNotification('❌ Ошибка соединения', 'error', error);
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
        showNotification('❌ Ошибка соединения', 'error', error);
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
function showNotification(message, type = 'info', details = null) {
    try { soundManager.play('notification'); } catch (e) { }
    const container = document.getElementById('notification-container');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    if (type === 'error') {
        const stackContext = details ? (details.stack || JSON.stringify(details)) : 'No technical details provided';
        const escapedStack = stackContext.toString().replace(/'/g, "\\'").replace(/"/g, '&quot;');

        notification.innerHTML = `
            <div class="notif-content">
                <span>${icon} ${message}</span>
                <button class="notif-report-btn" onclick="sendErrorReport('${message.replace(/'/g, "\\'")}', '${escapedStack}')">Отчёт</button>
            </div>
        `;
    } else {
        notification.innerHTML = `${icon} ${message}`;
    }

    notification.style.animation = 'slideInRight 0.3s ease-out';
    container.appendChild(notification);

    const duration = type === 'error' ? 10000 : 3000;
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    }, duration);
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
    if (screenName === 'profile') {
        const profileModal = document.getElementById('profile-modal');
        if (profileModal) {
            profileModal.style.display = 'flex';
            updateProfileScreen();
        }
        return;
    }

    // Stop containers polling when leaving that screen
    if (screenName !== 'containers' && typeof containersManager !== 'undefined') {
        containersManager.stopPolling();
    }

    Object.entries(screens).forEach(([name, screen]) => {
        if (screen && name !== 'profile') {
            screen.classList.remove('active');
        }
    });

    if (screens[screenName]) {
        if (screenName !== 'profile') {
            screens[screenName].classList.add('active');
        }
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
        loadDistricts();
        loadOrders();
    } else if (screenName === 'fuel') {
        updateFuelScreen();
    } else if (screenName === 'garage') {
        updateGarageScreen();
    } else if (screenName === 'partners') {
        // Список партнёров уже загружен в showPartnersList
    }
}

// ============= v2.1: ЕЖЕДНЕВНЫЙ БОНУС =============
async function claimDailyBonus() {
    try {
        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}/daily-bonus`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();

        if (response.ok && result.success) {
            await loadUserData();
            showNotification(`🎁 ${result.reward.label}`, 'success');
        } else {
            if (result.timeLeft) {
                const hours = Math.floor(result.timeLeft / (1000 * 60 * 60));
                const minutes = Math.floor((result.timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                showNotification(`⏰ Бонус будет доступен через ${hours}ч ${minutes}м`, 'warning');
            } else {
                showNotification(result.error || 'Ошибка', 'error');
            }
        }
    } catch (error) {
        console.error('Error claiming bonus:', error);
        showNotification('Ошибка сети', 'error');
    }
}

// ============= v2.1: РЕМОНТ МАШИНЫ =============
async function repairCar() {
    try {
        if (!confirm('Починить машину за 150 PLN?')) return;

        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}/repair`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();

        if (response.ok && result.success) {
            userData.balance = result.balance;
            userData.car = result.car;
            updateMainScreen();
            updateGarageScreen();
            showNotification('🔧 Машина отремонтирована!', 'success');
        } else {
            showNotification(result.error || 'Ошибка ремонта', 'error');
        }
    } catch (error) {
        console.error('Error repairing car:', error);
        showNotification('Ошибка сети', 'error');
    }
}

// ============= НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ =============
function setupEventListeners() {
    setupPromoListeners();
    setupAnnouncementListeners();
    setupPoliceListeners();
    setupMuteListener();
    console.log('🔄 Настройка обработчиков...');

    // Главное меню
    const buttons = {
        'online-btn': () => showScreen('orders'),
        'fuel-btn': () => showScreen('fuel'),
        'garage-btn': () => showScreen('garage'),
        'rest-btn': rest,
        'show-partners-btn': showPartnersList,
        'casino-btn': () => {
            showScreen('casino');
            if (typeof updateCasinoUI === 'function') updateCasinoUI();
        },
        'lootbox-btn': () => {
            showScreen('lootbox');
            if (typeof loadLootboxes === 'function') loadLootboxes();
        },
        'containers-btn': () => {
            showScreen('containers');
            if (typeof containersManager !== 'undefined') containersManager.onScreenOpen();
        }
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
        'back-from-partners': 'main',
        'back-from-containers': 'main'
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
            updateDistrictBackground();
        });
    });

    // v2.1: Daily Bonus
    const dailyBonusBtn = document.getElementById('daily-bonus-btn');
    if (dailyBonusBtn) {
        dailyBonusBtn.addEventListener('click', claimDailyBonus);
    }

    // v2.1: Repair
    const repairBtn = document.getElementById('repair-btn');
    if (repairBtn) {
        repairBtn.addEventListener('click', repairCar);
    }

    // v3.1: Profile Trigger
    const profileTrigger = document.getElementById('profile-trigger');
    if (profileTrigger) {
        console.log('✅ Настройка триггера профиля');
        profileTrigger.style.cursor = 'pointer'; // Force cursor
        profileTrigger.addEventListener('click', (e) => {
            console.log('👤 Клик по профилю');
            showScreen('profile');
        });
    }

    setupProfileListeners();

    console.log('✅ Все обработчики настроены');
}

// ============= v2.8: УПРАВЛЕНИЕ ЗВУКОМ =============
function setupMuteListener() {
    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
        muteBtn.addEventListener('click', () => {
            const isMuted = soundManager.toggleMute();
            muteBtn.textContent = isMuted ? '🔇' : '🔊';
            try { soundManager.play('button'); } catch (e) { }
        });

        // Initial state
        muteBtn.textContent = soundManager.muted ? '🔇' : '🔊';
    }
}

// ============= ЗАПУСК ПРИЛОЖЕНИЯ =============
(function () {
    try {
        const bootstrap = () => {
            console.log("🚦 Booting application...");
            setupEventListeners();
            initApp();
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bootstrap);
        } else {
            bootstrap();
        }
    } catch (e) {
        console.error("FATAL BOOT ERROR:", e);
        const splash = document.getElementById('splash-status');
        if (splash) splash.textContent = "Fatal: " + e.message;
    }
})();
// End of main script


// ============= v3.3: LEVEL UP WOW EFFECT =============
function showLevelUpWow(newLevel) {
    const modal = document.getElementById('level-up-modal');
    const badge = document.getElementById('new-level-badge');
    if (!modal || !badge) return;

    badge.textContent = newLevel;
    modal.style.display = 'flex';

    try { soundManager.play('achievement'); } catch (e) { }

    // Simple confetti simulation
    const container = document.getElementById('confetti-container');
    if (container) {
        container.innerHTML = '';
        for (let i = 0; i < 50; i++) {
            const confetti = document.createElement('div');
            confetti.style.position = 'absolute';
            confetti.style.width = '8px';
            confetti.style.height = '8px';
            confetti.style.background = ['#f3a000', '#ff9500', '#ffffff', '#007aff'][Math.floor(Math.random() * 4)];
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.top = '-10px';
            confetti.style.borderRadius = '50%';
            confetti.style.opacity = Math.random();
            confetti.style.transform = `rotate(${Math.random() * 360}deg)`;

            container.appendChild(confetti);

            const duration = 2000 + Math.random() * 3000;
            confetti.animate([
                { top: '-10px', transform: `translateX(0) rotate(0deg)` },
                { top: '100%', transform: `translateX(${Math.random() * 100 - 50}px) rotate(${Math.random() * 720}deg)` }
            ], {
                duration: duration,
                easing: 'cubic-bezier(0, .9, .6, 1)',
                fill: 'forwards'
            });
        }
    }
}

// v3.3: Dynamic Backgrounds
function updateDistrictBackground() {
    const screen = document.getElementById('orders-screen');
    if (!screen) return;

    screen.classList.remove('bg-suburbs', 'bg-center', 'bg-airport');
    screen.classList.add(`bg-${currentDistrict}`);
}


// ============= v2.9:  =============
function setupTutorialListener() {
    const closeBtn = document.getElementById('close-tutorial-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('tutorial-modal').style.display = 'none';
            localStorage.setItem('tutorial_completed', 'true');
            try { soundManager.play('button'); } catch (e) { }
            showNotification('Удачной работы! 🚀', 'success');
        });
    }
}

function checkTutorial() {
    const isCompleted = localStorage.getItem('tutorial_completed');
    // Show only if not completed and user is new (0 rides)
    if (!isCompleted && userData && (userData.rides_completed || 0) === 0) {
        setTimeout(() => {
            const modal = document.getElementById('tutorial-modal');
            if (modal) {
                modal.style.display = 'flex';
                try { soundManager.play('button'); } catch (e) { } // Subtle alert
            }
        }, 1500); // Small delay for effect
    }
}
// ============= v3.1: УПРАВЛЕНИЕ ПРОФИЛЕМ =============
function setupProfileListeners() {
    const closeBtn = document.getElementById('close-profile-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('profile-modal').style.display = 'none';
        });
    }

    // Buttons inside profile
    const lootboxBtn = document.getElementById('profile-lootbox-btn');
    if (lootboxBtn) lootboxBtn.addEventListener('click', () => { showScreen('lootbox'); document.getElementById('profile-modal').style.display = 'none'; });

    const promoBtn = document.getElementById('profile-promo-btn');
    if (promoBtn) promoBtn.addEventListener('click', () => { document.getElementById('promo-modal').style.display = 'flex'; });

    const bonusBtn = document.getElementById('profile-daily-bonus-btn');
    if (bonusBtn) bonusBtn.addEventListener('click', claimDailyBonus);

    const tutorialBtn = document.getElementById('profile-tutorial-btn');
    if (tutorialBtn) tutorialBtn.addEventListener('click', () => { document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); document.getElementById('tutorial-modal').style.display = 'flex'; });

    const claimStreakBtn = document.getElementById('profile-claim-streak-btn');
    if (claimStreakBtn) claimStreakBtn.addEventListener('click', claimStreakReward);
}

function updateProfileScreen() {
    if (!userData) return;

    const elements = {
        name: document.getElementById('profile-name'),
        level: document.getElementById('profile-level'),
        totalEarned: document.getElementById('profile-total-earned'),
        ridesTotal: document.getElementById('profile-rides-total'),
        totalDistance: document.getElementById('profile-total-distance'),
        streak: document.getElementById('profile-streak'),
        jackpot: document.getElementById('jackpot-amount'),
        streakDays: document.getElementById('profile-streak-days'),
        avatar: document.getElementById('profile-avatar-img')
    };

    if (elements.name) elements.name.textContent = PLAYER_NAME;
    if (elements.avatar) elements.avatar.src = PLAYER_AVATAR;
    if (elements.level) elements.level.textContent = userData.level || 1;
    if (elements.totalEarned) elements.totalEarned.textContent = userData.total_earned?.toFixed(2) || '0.00';
    if (elements.ridesTotal) elements.ridesTotal.textContent = userData.rides_completed || '0';
    if (elements.totalDistance) elements.totalDistance.textContent = userData.total_distance?.toFixed(1) || '0.0';
    if (elements.streak) elements.streak.textContent = userData.rides_streak || '0';
    if (elements.jackpot && userData.jackpot_pool !== undefined) {
        elements.jackpot.textContent = userData.jackpot_pool.toFixed(2);
    }
    if (elements.streakDays) elements.streakDays.textContent = `${userData.rides_streak || 0} дней`;

    // Admin button in profile
    const adminBtn = document.getElementById('profile-admin-btn');
    if (adminBtn) {
        const isAdmin = (TELEGRAM_ID === 123456789 || TELEGRAM_ID === '5275887201' || TELEGRAM_ID === '726693898');
        adminBtn.style.display = isAdmin ? 'flex' : 'none';
        adminBtn.onclick = () => window.location.href = '/admin';
    }

    // v3.2: Render achievements in profile with labels
    const achList = document.getElementById('profile-achievements-list');
    if (achList && userData.achievements) {
        try {
            const achievements = Object.values(userData.achievements);
            if (achievements.length === 0) {
                achList.innerHTML = '<div class="no-achievements">\ud83c\udfaf \u0412\u044b\u043f\u043e\u043b\u043d\u044f\u0439\u0442\u0435 \u0437\u0430\u043a\u0430\u0437\u044b, \u0447\u0442\u043e\u0431\u044b \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u0434\u043e\u0441\u0442\u0438\u0436\u0435\u043d\u0438\u044f!</div>';
            } else {
                achList.innerHTML = achievements.map(ach => {
                    const done = ach && ach.completed;
                    return `
                    <div class="ach-card ${done ? 'ach-done' : 'ach-locked'}">
                        <div class="ach-icon">${ach.icon || (done ? '\ud83c\udfc6' : '\ud83d\udd12')}</div>
                        <div class="ach-info">
                            <div class="ach-name">${ach.name || '\u0414\u043e\u0441\u0442\u0438\u0436\u0435\u043d\u0438\u0435'}</div>
                            ${ach.description ? `<div class="ach-desc">${ach.description}</div>` : ''}
                        </div>
                        ${done ? '<div class="ach-badge">\u2705</div>' : ''}
                    </div>`;
                }).join('');
            }
        } catch (e) { console.error('Error rendering profile achievements:', e); }
    }
}
// ============= v3.3: LICENSE PLATE MANAGEMENT =============

function setupPlatesListeners() {
    const btn = document.getElementById('plates-btn');
    if (btn) {
        btn.onclick = () => {
            document.getElementById('plates-modal').style.display = 'flex';
            loadPlates();
            switchPlatesTab('my');
        };
    }
}

function switchPlatesTab(tab, event) {
    document.querySelectorAll('.plate-tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.plates-tabs .tab-btn').forEach(el => el.classList.remove('active'));

    const tabContent = document.getElementById(`plates-tab-${tab}`);
    if (tabContent) tabContent.style.display = 'block';

    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    } else {
        // Fallback: find the button by its onclick attribute or text if event is missing
        const buttons = document.querySelectorAll('.plates-tabs .tab-btn');
        buttons.forEach(btn => {
            if (btn.getAttribute('onclick')?.includes(`'${tab}'`)) {
                btn.classList.add('active');
            }
        });
    }

    if (tab === 'market') loadMarketPlates();
}

function updatePlatePreview() {
    const input = document.getElementById('custom-plate-input');
    const preview = document.getElementById('custom-plate-preview');
    const priceEl = document.getElementById('create-plate-price');

    let text = input.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    input.value = text;
    preview.textContent = text || 'YOUR-NAME';

    // Simple price calc mirror of backend for UI
    const basePrice = 500000;
    const charSurcharge = 750000;
    const baseLength = 4;
    let price = basePrice;
    if (text.length > baseLength) {
        price = Math.min(5000000, basePrice + (text.length - baseLength) * charSurcharge);
    }
    priceEl.textContent = `Цена: ${price.toLocaleString()} PLN`;
}

async function loadPlates() {
    try {
        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}/plates`);
        const data = await response.json();
        if (data.success) {
            displayPlates(data.plates);
        }
    } catch (e) { console.error(e); }
}

function displayPlates(plates) {
    const list = document.getElementById('plates-list');
    if (!list) return;

    if (plates.length === 0) {
        list.innerHTML = '<div class="text-center opacity-60 p-4">У вас пока нет уникальных номеров.</div>';
        return;
    }

    list.innerHTML = plates.map(p => `
        <div class="plate-item-card ${p.rarity}">
            <div class="license-plate ${p.rarity}">${p.plate_number}</div>
            <div class="plate-info">
                <div class="plate-rarity-label">${p.rarity.toUpperCase()}</div>
                <div class="plate-buffs">${formatBuffs(p.buffs)}</div>
            </div>
            <div class="plate-actions">
                ${p.is_equipped ? '<span class="equipped-badge">✅ Стандарт</span>' : `<button class="p-btn" onclick="equipPlate('${p.plate_number}')">Надеть</button>`}
                ${!p.is_equipped ? `<button class="p-btn sell" onclick="listPlatePrompt('${p.plate_number}')">Продать</button>` : ''}
            </div>
        </div>
    `).join('');
}

function formatBuffs(buffs) {
    let res = [];
    if (buffs.tip_multiplier > 1) res.push(`+${Math.round((buffs.tip_multiplier - 1) * 100)}% чаевых`);
    if (buffs.police_resistance < 1) res.push(`-${Math.round((1 - buffs.police_resistance) * 100)}% шанс ГАИ`);
    return res.join('<br>');
}

async function equipPlate(plateNumber) {
    try {
        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}/plates/equip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plateNumber })
        });
        const data = await response.json();
        if (data.success) {
            showNotification('✅ Номер успешно установлен!', 'success');
            loadUserData(); // Refresh car data
            loadPlates();
        } else {
            showNotification(`❌ ${data.error}`, 'error');
        }
    } catch (e) { console.error(e); }
}

async function rollPlate() {
    try {
        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}/plates/roll`, { method: 'POST' });
        const data = await response.json();
        if (data.success) {
            showLevelUpWow('NEW_PLATE');
            showNotification(`🎉 Вы выбили номер: ${data.plate.plate_number}!`, 'success');
            userData.balance = data.balance;
            updateMainScreen();
            loadPlates();
        } else {
            showNotification(`❌ ${data.error}`, 'error');
        }
    } catch (e) { console.error(e); }
}

async function createCustomPlate() {
    const text = document.getElementById('custom-plate-input').value;
    if (!text) return;

    try {
        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}/plates/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        const data = await response.json();
        if (data.success) {
            showNotification(`✨ Номер ${data.plate.plate_number} создан!`, 'success');
            userData.balance = data.balance;
            updateMainScreen();
            loadPlates();
            switchPlatesTab('my');
        } else {
            showNotification(`❌ ${data.error}`, 'error');
        }
    } catch (e) { console.error(e); }
}

async function loadMarketPlates() {
    const list = document.getElementById('market-plates-list');
    list.innerHTML = '<div class="loading">Загрузка рынка...</div>';

    try {
        const response = await fetch(`${API_BASE_URL}/plates/market`);
        const data = await response.json();
        if (data.success) {
            if (data.plates.length === 0) {
                list.innerHTML = '<div class="text-center p-4">На рынке пока нет номеров.</div>';
                return;
            }
            list.innerHTML = data.plates.map(p => `
                <div class="market-plate-item ${p.rarity}">
                    <div class="license-plate ${p.rarity}">${p.plate_number}</div>
                    <div class="market-info">
                        <div class="m-buffs">${formatBuffs(p.buffs)}</div>
                        <div class="m-price">${p.market_price.toLocaleString()} PLN</div>
                    </div>
                    <button class="buy-btn" onclick="buyMarketPlate('${p.plate_number}')">Купить</button>
                </div>
            `).join('');
        }
    } catch (e) { console.error(e); }
}

async function buyMarketPlate(plateNumber) {
    try {
        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}/plates/buy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plateNumber })
        });
        const data = await response.json();
        if (data.success) {
            showNotification(data.message, 'success');
            userData.balance = data.balance;
            updateMainScreen();
            loadMarketPlates();
        } else {
            showNotification(`❌ ${data.error}`, 'error');
        }
    } catch (e) { console.error(e); }
}

function listPlatePrompt(plateNumber) {
    const price = prompt('Введите цену продажи (PLN):');
    if (!price || isNaN(price)) return;

    listPlateForSale(plateNumber, parseInt(price));
}

async function listPlateForSale(plateNumber, price) {
    try {
        const response = await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}/plates/list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plateNumber, price })
        });
        const data = await response.json();
        if (data.success) {
            showNotification(data.message, 'success');
            loadPlates();
        } else {
            showNotification(`❌ ${data.error}`, 'error');
        }
    } catch (e) { console.error(e); }
}

// v3.3: Global Street Feed Logic
function initStreetFeed() {
    const content = document.getElementById('street-feed-content');
    if (!content) return;

    // Simulate real-time updates
    const events = [
        "Vlad только что выиграл Skoda Octavia в контейнере!",
        "Artem выполнил VIP заказ на 12,000 PLN!",
        "Система: Джекпот составляет уже 450,000 PLN!",
        "Igor выбил легендарный номер BOSS!",
        "Maks продал номер AA-777-AA на рынке за 2,000,000 PLN!"
    ];

    setInterval(() => {
        const msg = events[Math.floor(Math.random() * events.length)];
        content.style.opacity = '0';
        setTimeout(() => {
            content.textContent = `⚡ ${msg}`;
            content.style.opacity = '1';
        }, 500);
    }, 15000);
}

function updatePlatesUI() {
    const rollBtn = document.querySelector('.roll-plate-box .menu-btn.primary');
    if (rollBtn && userData) {
        if (userData.free_plate_rolls > 0) {
            rollBtn.innerHTML = `🎰 Использовать бесплатный ролл (Доступно: ${userData.free_plate_rolls})`;
            rollBtn.style.background = 'linear-gradient(45deg, #FFD700, #FFA500)';
            rollBtn.style.color = '#000';
            rollBtn.style.fontWeight = '800';
        } else {
            rollBtn.innerHTML = `🎰 Выбить номер (50,000 PLN)`;
            rollBtn.style.background = ''; // Reset to CSS default
            rollBtn.style.color = '';
            rollBtn.style.fontWeight = '';
        }
    }
}

function updateBalanceDisplay() {
    if (!userData) return;
    const balanceEl = document.getElementById('balance');
    const fuelBalanceEl = document.getElementById('fuel-balance');
    const casinoBalanceEl = document.getElementById('casino-balance');
    const skillsBalanceEl = document.getElementById('skills-balance');
    const pTotalEarnedEl = document.getElementById('profile-total-earned');

    const formattedBalance = userData.balance?.toFixed(2) || '0.00';

    if (balanceEl) balanceEl.textContent = formattedBalance;
    if (fuelBalanceEl) fuelBalanceEl.textContent = formattedBalance;
    if (casinoBalanceEl) casinoBalanceEl.textContent = Math.floor(userData.balance || 0);
    if (skillsBalanceEl) skillsBalanceEl.textContent = formattedBalance;
    if (pTotalEarnedEl) pTotalEarnedEl.textContent = userData.total_earned?.toFixed(2) || '0.00';
}
