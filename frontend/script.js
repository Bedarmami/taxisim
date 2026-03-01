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

/**
 * Taxi Simulator PRO - v6.0.3
 * Recently added: Autonomous Tesla Model 3 Performance, Paid Rest, Fleet Withdraw
 */
// ============= ГЛОБАЛЬНОЕ СОСТОЯНИЕ =============
let userData = null;
let orders = [];
let orderTimers = [];
let currentFilter = 'all';
let currentDistrict = 'suburbs';
let districts = [];
let staminaInterval = null;
let eventInterval = null;
// v6.1.0: Crypto State
let cryptoPrice = { currentPrice: 1.0, history: [] };

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
    business: document.getElementById('business-screen'),
    skills: document.getElementById('skills-screen'),
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
        const result = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/police/settle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        });

        if (result && result.success) {
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
        } else {
            showNotification(result?.error || 'Ошибка связи с ГАИ', 'error');
        }
    } catch (e) {
        console.error('Police settle error:', e);
        showNotification('Ошибка связи с ГАИ', 'error');
    }
}

// ============= v3.7: ИНТЕРАКТИВНЫЕ КВЕСТЫ =============
function handleInteractiveQuest(eventData) {
    const modal = document.getElementById('quest-modal');
    if (!modal) return;

    const iconEl = document.getElementById('quest-icon');
    const messageEl = document.getElementById('quest-message');
    const actionsEl = document.getElementById('quest-actions');
    const resultDiv = document.getElementById('quest-result');
    const closeBtn = document.getElementById('quest-close-btn');

    modal.style.display = 'flex';
    if (iconEl) iconEl.textContent = eventData.icon || '❓';
    if (messageEl) messageEl.textContent = eventData.message || 'Случайное событие!';

    actionsEl.innerHTML = '';
    actionsEl.style.display = 'flex';
    resultDiv.style.display = 'none';
    closeBtn.style.display = 'none';

    if (eventData.choices && eventData.choices.length > 0) {
        eventData.choices.forEach(choice => {
            const btn = document.createElement('button');
            btn.className = 'action-btn';
            btn.textContent = choice.text;
            btn.onclick = () => settleInteractiveQuest(eventData.quest_id, choice.id);
            actionsEl.appendChild(btn);
        });
    } else {
        // Fallback info event
        closeBtn.style.display = 'block';
    }

    try { soundManager.play('siren'); } catch (e) { }
}

async function settleInteractiveQuest(questId, choiceId) {
    try {
        const result = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/resolve-event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ questId, choiceId })
        });

        if (result && result.success) {
            userData.balance = result.new_balance;
            userData.stamina = result.stamina;
            updateMainScreen();

            const resultDiv = document.getElementById('quest-result');
            const actions = document.getElementById('quest-actions');
            const closeBtn = document.getElementById('quest-close-btn');

            if (actions) actions.style.display = 'none';
            if (resultDiv) {
                resultDiv.style.display = 'block';
                resultDiv.innerHTML = `
                    <div style="font-size: 40px; margin-bottom: 10px;">${result.icon || 'ℹ️'}</div>
                    <p>${result.rewardText}</p>
                    ${result.deltaBalance ? `<div style="color: ${result.deltaBalance > 0 ? '#34C759' : '#ff3b30'}">${result.deltaBalance > 0 ? '+' : ''}${result.deltaBalance} PLN</div>` : ''}
                    ${result.deltaStamina ? `<div style="color: ${result.deltaStamina > 0 ? '#34C759' : '#ff3b30'}">⚡ ${result.deltaStamina > 0 ? '+' : ''}${result.deltaStamina} Выносливости</div>` : ''}
                    ${result.deltaWear ? `<div style="color: #ff9500">🔧 Износ авто: +${result.deltaWear}%</div>` : ''}
                `;
            }
            if (closeBtn) {
                closeBtn.style.display = 'block';
                closeBtn.onclick = () => {
                    const modal = document.getElementById('quest-modal');
                    if (modal) modal.style.display = 'none';
                };
            }

            if (result.deltaBalance > 0) {
                try { soundManager.play('success'); } catch (e) { }
            } else if (result.deltaBalance < 0 || result.deltaWear > 0) {
                try { soundManager.play('error'); } catch (e) { }
            } else {
                try { soundManager.play('button'); } catch (e) { }
            }
        } else {
            showNotification(result?.error || 'Ошибка связи с сервером', 'error');
        }
    } catch (e) {
        console.error('Quest settle error:', e);
        showNotification('Ошибка связи с сервером', 'error');
    }
}

async function checkAnnouncements() {
    try {
        const data = await safeFetchJson(`${API_BASE_URL}/announcement`);

        if (data && data.active) {
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
        const data = await safeFetchJson(`${API_BASE_URL}/promo/redeem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: TELEGRAM_ID, code })
        });

        if (data && !data._isError) {
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
        console.error('Promo error:', e);
        resultDiv.style.color = '#ff3b30';
        resultDiv.textContent = 'Ошибка сети';
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
            const data = await safeFetchJson(`${API_BASE_URL}/online-count`);
            const el = document.getElementById('splash-online-count');
            if (el && data && data.count !== undefined) el.textContent = data.count;
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
                const data = await safeFetchJson(`${API_BASE_URL}/auction/pending/${TELEGRAM_ID}`);
                if (data && !data._isError && data.rewards && data.rewards.length > 0) {
                    setTimeout(() => containersManager.showRewardModal(data.rewards[0], 0), 1000);
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
        const data = await safeFetchJson(`${API_BASE_URL}/online-count`);
        const el = document.getElementById('online-count');
        if (el && data && data.count !== undefined) el.textContent = data.count;
    } catch (e) { }
}

// ============= ЗАГРУЗКА ДАННЫХ ПОЛЬЗОВАТЕЛЯ =============
async function loadUserData() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
        const url = new URL(`${API_BASE_URL}/user/${TELEGRAM_ID}`);
        if (PLAYER_NAME) url.searchParams.append('username', PLAYER_NAME);

        const data = await safeFetchJson(url, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (data && !data._isError) {
            userData = data;
            if (data.current_district) currentDistrict = data.current_district;
        } else {
            // Check for maintenance specifically if status is available in data
            if (data && data.status === 503) {
                checkMaintenance(503);
                return;
            }
            throw new Error(data?.error || 'Failed to load user data');
        }

        localStorage.setItem('userData', JSON.stringify(userData));

        updateMainScreen();
        updateFuelScreen();
        updateGarageScreen();
        updateBalanceDisplay();
        updatePlatesUI();
        updateGlobalEventBanner(); // v6.1.0
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
            // v6.2: Skeleton loading instead of spinner
            ordersList.innerHTML = [1, 2, 3].map(() => `
                <div class="skeleton-card">
                    <div class="skeleton-header">
                        <div class="skeleton skeleton-circle"></div>
                        <div style="flex:1">
                            <div class="skeleton skeleton-line m"></div>
                            <div class="skeleton skeleton-line s"></div>
                        </div>
                    </div>
                    <div class="skeleton skeleton-line l"></div>
                    <div class="skeleton skeleton-line m"></div>
                    <div class="skeleton skeleton-btn"></div>
                </div>
            `).join('');
        }


        const url = `${API_BASE_URL}/orders/${TELEGRAM_ID}?district=${currentDistrict}`;
        const data = await safeFetchJson(url);

        if (data && data.status === 503) {
            checkMaintenance(503);
            return;
        }

        if (data && !data._isError) {
            orders = Array.isArray(data) ? data : (data.orders || []);
            orderTimers.forEach(timer => clearTimeout(timer));
            orderTimers = [];
            displayOrders();

            if (orders && orders.length > 0) {
                showNotification(`✅ Загружено ${orders.length} новых заказов`, 'success');
            }
        } else {
            showNotification('❌ Ошибка загрузки заказов', 'error');
        }
    } catch (error) {
        console.error('Error loading orders:', error);
        showNotification('❌ Ошибка загрузки заказов', 'error');
    }
}

// ============= v2.2: ЗАГРУЗКА РАЙОНОВ =============
async function loadDistricts() {
    try {
        const data = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/districts`);
        if (data && data.status === 503) {
            checkMaintenance(503);
            return;
        }
        if (data && !data._isError) {
            districts = Array.isArray(data) ? data : (data.districts || []);
        }
    } catch (error) {
        console.error('Error loading districts:', error);
    }
}

async function selectDistrict(districtId) {
    currentDistrict = districtId;
    loadOrders();
    showScreen('orders');
}

async function relocate() {
    const unlockedDistricts = districts.filter(d => d.unlocked && d.id !== currentDistrict);
    if (unlockedDistricts.length === 0) {
        showNotification('Нет других доступных районов', 'info');
        return;
    }

    const price = 50; // Relocation fee
    const names = unlockedDistricts.map((d, i) => `${i + 1}. ${d.name} (${price} PLN)`).join('\n');
    const picked = prompt(`Выберите район для переезда (${price} PLN):\n${names}`);

    const idx = parseInt(picked) - 1;
    if (idx >= 0 && idx < unlockedDistricts.length) {
        const target = unlockedDistricts[idx];
        if (userData.balance < price) {
            showNotification('Недостаточно денег для переезда!', 'error');
            return;
        }

        if (confirm(`Переехать в ${target.name} за ${price} PLN?`)) {
            try {
                // In a real app we'd have a backend endpoint for this. 
                // For simplicity we can reuse the user update logic if balance is deducted.
                // But better to just use ride endpoint with a special "relocation" order? 
                // Let's just update local and save.
                userData.balance -= price;
                currentDistrict = target.id;
                userData.current_district = target.id;

                await fetch(`${API_BASE_URL}/user/${TELEGRAM_ID}/save`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(userData)
                });

                showNotification(`🚚 Вы успешно переехали в ${target.name}`, 'success');
                loadOrders();
                updateMainScreen();
            } catch (e) {
                showNotification('Ошибка при переезде', 'error');
            }
        }
    }
}

// v3.5: Automatic Cache Busting on startup
(function () {
    const versionKey = 'app_freshened_v342';
    if (!sessionStorage.getItem(versionKey)) {
        sessionStorage.setItem(versionKey, 'true');
        const url = new URL(window.location.href);
        url.searchParams.set('v', Date.now());
        window.location.href = url.toString();
    }
})();

function forceReload() {
    // Keep function for internal use if needed, but it now uses the same logic
    sessionStorage.removeItem('app_freshened');
    window.location.reload();
}

window.relocate = relocate;

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

    const currentDistrictData = districts.find(d => d.id === currentDistrict) || { name: currentDistrict };
    ordersList.innerHTML = `
        <div class="district-header" style="background: rgba(255,160,0,0.1); padding: 10px; border-radius: 12px; margin-bottom: 20px; border: 1px solid rgba(255,160,0,0.2); display: flex; justify-content: space-between; align-items: center;">
            <div>
                <span style="opacity: 0.6; font-size: 0.8em; display: block;">Ваше местоположение:</span>
                <span style="font-weight: 800; font-size: 1.1em; color: var(--accent-color);">${currentDistrictData.name || currentDistrict}</span>
            </div>
            <button class="action-btn small" onclick="relocate()" style="padding: 5px 12px; font-size: 0.85em; background: #333;">🗺️ Переехать</button>
        </div>
    `;

    let filteredOrders = [...orders];
    switch (currentFilter) {
        case 'cheap': filteredOrders = orders.filter(o => o.price < 30); break;
        case 'expensive': filteredOrders = orders.filter(o => o.price >= 50); break;
        case 'vip': filteredOrders = orders.filter(o => o.is_vip === true); break;
        case 'all': // No filter needed, already copied all orders
        default: break;
    }

    if (filteredOrders.length === 0) {
        ordersList.innerHTML = `<div class="no-orders">Не найдено заказов по фильтру "${currentFilter}" 🔍</div>`;
        return;
    }

    ordersList.innerHTML = filteredOrders.map((order) => {
        const canTake = canTakeOrder(order);
        const price = order.prices?.yodex?.price || order.price || 0;
        // v6.1.2: classify card tier by price
        let orderClass = order.class || 'economy';
        const isVip = order.is_vip || price > 600;
        if (isVip) orderClass = 'vip';
        else if (price > 400) orderClass = 'business';
        else if (price > 250) orderClass = 'comfort';

        const passenger = order.passenger || { name: 'Клиент', avatar: '👤', rating: '5.0' };

        // Find current aggregator choice or use default
        const aggId = 'yodex'; // In a real app we'd track selected app
        const aggInfo = order.prices[aggId] || { price: order.price, color: '#f3a000', commission: 0.2 };

        const vipBadge = isVip ? `<span class="vip-badge">⭐ VIP</span>` : '';

        return `
            <div class="order-card ${orderClass}" id="order-${order.id}">
                <div class="order-header">
                    <div class="passenger-meta">
                        <div class="passenger-avatar">${passenger.avatar}</div>
                        <div class="user-meta">
                            <span class="passenger-name">${passenger.name}${vipBadge}</span>
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
                ${userData.car && userData.car.has_autopilot ? `
                <button class="btn-autopilot" 
                        onclick="takeOrder('${order.id}', event, true)"
                        ${userData.fuel >= (((userData.car?.fuel_consumption || userData.fuel_consumption || 8) / 100) * order.distance) ? '' : 'disabled'}>
                    <span class="icon">🤖</span> К автопилоту
                </button>` : ''}
            </div>
        `;
    }).join('');

    startOrderTimers();
}

// ============= ПРОВЕРКА ВОЗМОЖНОСТИ ВЗЯТЬ ЗАКАЗ =============
function canTakeOrder(order, useAutopilot = false) {
    if (!userData) return false;
    if (!useAutopilot && userData.stamina <= 0) return false;
    if (!userData.fuel_consumption) return false;

    const fuelNeeded = (userData.fuel_consumption / 100) * order.distance;
    return userData.fuel >= fuelNeeded;
}

// ============= ВЗЯТЬ ЗАКАЗ =============
let isProcessingOrder = false;

async function takeOrder(orderId, event, useAutopilot = false) {
    if (isProcessingOrder) return;

    const order = orders.find(o => o.id === orderId);

    if (!order) {
        showNotification('❌ Заказ не найден', 'error');
        return;
    }

    if (!canTakeOrder(order, useAutopilot)) {
        showNotification('❌ Недостаточно топлива или выносливости!', 'error');
        return;
    }

    const card = document.getElementById(`order-${orderId}`);
    if (card) {
        card.classList.add('in-progress');
    }

    try {
        isProcessingOrder = true;
        try { soundManager.play('engine'); } catch (e) { }

        // Start animation before/during API call
        const rideDuration = 3000; // 3 seconds visual ride
        const animationPromise = animateRide(orderId, rideDuration);

        // v4.1: Send current district to apply Turf Wars bonus if applicable
        const district = window.currentDistrictId || 'center'; // defaulting to center if not set

        const result = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/ride`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: orderId, useGas: false, autopilot: useAutopilot, district })
        });

        if (result && result._isError) {
            throw new Error(result.error || 'Ошибка выполнения заказа');
        }

        // Wait for animation to finish
        await animationPromise;

        // v6.2: Show success overlay before removing/updating order card
        if (result.success && card) {
            const overlay = document.createElement('div');
            overlay.className = 'order-success-overlay';
            overlay.innerHTML = `
                <div class="order-success-checkmark">✅</div>
                <div class="order-success-text">ПРИНЯТО</div>
                <div class="order-success-amount">+${result.earnings?.toFixed(2) || result.earnings.toFixed(2)} PLN</div>
            `;
            card.appendChild(overlay);

            // Wait 1.2s to enjoy the success screen before loading new orders
            await new Promise(r => setTimeout(r, 1200));
        }

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
            if (result.current_district) currentDistrict = result.current_district;

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
                    isProcessingOrder = false;
                    return;
                } else if (result.event.has_quest) {
                    handleInteractiveQuest(result.event);
                    isProcessingOrder = false;
                    return;
                }
                showNotification(`${result.event.message}`, 'info');
            }

            setTimeout(() => loadOrders(), 1500);
        }

        if (result.earnings) {
            showNotification(`✅ Заказ выполнен! +${result.earnings.toFixed(2)} PLN`, 'success');
            try { soundManager.play('coin'); } catch (e) { }
        }

    } catch (error) {
        console.error('Error:', error);
        showNotification(error.message, 'error');
        if (card) card.classList.remove('in-progress');
    } finally {
        isProcessingOrder = false;
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

        const result = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/fuel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ liters, type: fuelType })
        });

        console.log('📡 Результат:', result);

        if (result && !result._isError && result.success) {
            userData.balance = result.new_balance || userData.balance;
            userData.fuel = result.new_fuel !== undefined ? result.new_fuel : userData.fuel;
            userData.gas_fuel = result.new_gas_fuel !== undefined ? result.new_gas_fuel : (userData.gas_fuel || 0);

            updateMainScreen();
            updateFuelScreen();

            showNotification(result.message || `✅ Заправлено ${result.liters_added} л`, 'success');
            try { soundManager.play('coin'); } catch (e) { }

            setTimeout(() => showScreen('main'), 1500);
        } else {
            showNotification(result?.error || '❌ Ошибка заправки', 'error');
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
        achievementsPreview: document.getElementById('achievements-preview'),
        districtName: document.getElementById('current-district-name')
    };

    if (elements.districtName) {
        const d = districts.find(d => d.id === currentDistrict) || { name: currentDistrict };
        elements.districtName.textContent = d.name || currentDistrict;
    }

    if (elements.balance) elements.balance.textContent = userData.balance?.toFixed(2) || '0.00';
    if (elements.jackpotAmount && userData.jackpot_pool !== undefined) {
        elements.jackpotAmount.textContent = userData.jackpot_pool.toFixed(2);
    }
    if (elements.carModel) elements.carModel.textContent = userData.car?.name || userData.car || '🚗 Неизвестно';

    // v6.1.2: Update city hero car emoji & name
    const heroEmoji = document.getElementById('car-hero-emoji');
    const heroName = document.getElementById('car-hero-name');
    if (heroEmoji && userData.car) {
        const carId = userData.car?.id || '';
        if (carId.includes('tesla')) {
            heroEmoji.textContent = '🔋';
        } else if (userData.car?.is_premium) {
            heroEmoji.textContent = '🚗';
        } else {
            heroEmoji.textContent = '🚕';
        }
    }
    if (heroName && userData.car) {
        heroName.textContent = userData.car?.name || '';
    }
    if (elements.fuel) elements.fuel.textContent = userData.fuel?.toFixed(1) || '0.0';
    if (elements.maxFuel) elements.maxFuel.textContent = userData.max_fuel || '45';
    if (elements.stamina) elements.stamina.textContent = Math.floor(userData.stamina || 0);

    // v6.1.0: Crypto in main screen? Maybe only in wallet, but we sync balance here
    if (userData.crypto_taxi_balance !== undefined) {
        const cryptoEl = document.getElementById('user-crypto-balance');
        if (cryptoEl) cryptoEl.textContent = `${Number(userData.crypto_taxi_balance).toFixed(4)} $TAXI`;
    }
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
// Helper to render car icon (emoji or image)
function renderCarImage(car, size = '40px') {
    if (!car || !car.image) return '🚗';
    const img = car.image.toString();
    if (img.includes('/') || img.includes('assets') || img.includes('http') || img.includes('.png') || img.includes('.webp')) {
        const src = img.startsWith('/') ? img : `/${img}`;
        return `<img src="${src}" class="car-asset-img" style="max-height: ${size}; vertical-align: middle; border-radius: 4px;" onerror="this.src='assets/cars/fabia.png'">`;
    }
    return car.image;
}

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

    // v6.0.2: Autonomous toggle for Tesla 3 Perf
    const autoToggleContainer = document.getElementById('garage-autonomous-controls');
    if (autoToggleContainer) {
        if (userData.car && userData.car.is_autonomous) {
            autoToggleContainer.style.display = 'block';
            autoToggleContainer.innerHTML = `
                <div style="background:rgba(88, 86, 214, 0.1); border:1px solid #5856d644; border-radius:12px; padding:15px; margin-top:15px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-weight:bold; color:#fff;">🤖 Автономный режим</div>
                        <div style="font-size:0.75em; color:#aaa;">Будет зарабатывать даже оффлайн!</div>
                    </div>
                    <button class="action-btn ${userData.is_autonomous_active ? 'error' : 'success'}" 
                            onclick="toggleAutonomous()">
                        ${userData.is_autonomous_active ? 'Остановить' : 'Запустить'}
                    </button>
                </div>
            `;
        } else {
            autoToggleContainer.style.display = 'none';
        }
    }
}

// v6.0.2: Autonomous toggle and Paid rest are now at the end of the file for better organization.

// ============= ЗАГРУЗКА МОИХ МАШИН (ГАРАЖ) =============
async function loadMyCars() {
    try {
        const data = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/garage`);
        if (data && !data._isError) {
            const myCars = Array.isArray(data) ? data : (data.plates || data.owned_cars || []);
            const businessData = userData.business || { rented_cars: {} };
            const rentedCars = businessData.rented_cars || {};

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
                                <button class="action-btn" onclick="recallCar('${car.id}')" style="background: #FF3B30; width: 100%;">Вернуть в гараж</button>
                            `;
                        } else {
                            actionButton = `
                                <button class="action-btn" onclick="selectCar('${car.id}')" style="margin-bottom: 5px; width: 100%;">Сесть за руль</button>
                                ${car.purchase_price > 0 ? `<button class="action-btn" onclick="moveToFleet(${myCars.indexOf(car)})" style="background: #5856D6; width: 100%; margin-bottom: 5px;">Отправить в автопарк</button>` : ''}
                                <button class="action-btn" onclick="sellCarOnMarket('${car.id}')" style="background: #FF9500; width: 100%;">Продать (Барахолка)</button>
                            `;
                        }

                        const plateHtml = car.plate ? `<div class="license-plate ${car.plate.rarity}">${car.plate.number}</div>` : '';

                        return `
                            <div class="car-card ${car.is_selected ? 'selected-car' : ''}" style="${car.is_selected ? 'border: 2px solid #34C759;' : ''}">
                                <div class="car-card-header">
                                    <span class="car-icon">${renderCarImage(car)}</span>
                                    <div style="display: flex; flex-direction: column;">
                                        <span class="car-name">${car.name}</span>
                                        ${plateHtml}
                                    </div>
                                </div>
                                <div class="car-specs">
                                    <div>⛽ ${car.fuel_consumption} л/100км</div>
                                    <div>🛢️ ${car.tank_capacity} л</div>
                                </div>
                                <div style="margin-top: 10px; width: 100%;">${actionButton}</div>
                            </div>
                        `;
                    }).join('');
                }
            }
        }
    } catch (error) {
        console.error('Error loading garage:', error);
    }
}

// ============= ФУНКЦИИ АВТОПАРКА =============
async function moveToFleet(carIdx) {
    try {
        if (!confirm('Перегнать эту машину в бизнес-автопарк? Вы сможете нанимать водителей для неё в меню Бизнес.')) return;

        const result = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/fleet/move-from-garage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ carIdx })
        });

        if (result && result.success) {
            showNotification(result.message, 'success');
            // Refresh local data
            const userDataResult = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}`);
            if (userDataResult && !userDataResult._isError) {
                userData = userDataResult;
            }
            updateGarageScreen();
        } else {
            showNotification(result?.error || 'Ошибка', 'error');
        }
    } catch (e) {
        console.error(e);
        showNotification('Ошибка сети', 'error');
    }
}

async function recallCar(carId) {
    try {
        const result = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/fleet/recall`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ carId })
        });

        if (result && result.success) {
            userData.business = result.business;
            showNotification(result.message, 'success');
            updateGarageScreen();
        } else {
            showNotification(result?.error || 'Ошибка', 'error');
        }
    } catch (e) {
        console.error(e);
        showNotification('Ошибка сети', 'error');
    }
}

// ============= ВЫБОР МАШИНЫ =============
async function selectCar(carId) {
    try {
        const result = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/select-car`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ carId })
        });

        if (result && result.success) {
            userData.car = result.new_car;
            showNotification(`🚗 Вы пересели на ${result.new_car.name}`, 'success');
            updateMainScreen();
            updateGarageScreen();
        } else {
            showNotification(result?.error || 'Ошибка смены машины', 'error');
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

        const cars = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/available-cars`);
        console.log('Получены машины:', cars);

        if (!cars || cars._isError || !Array.isArray(cars)) {
            console.error('Сервер вернул ошибку или не массив:', cars);
            return;
        }
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
                            <span class="car-icon">${renderCarImage(car)}</span>
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
                            <span class="car-icon">${renderCarImage(car)}</span>
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

        const result = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/rent-car`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ carId })
        });

        if (result && result.success) {
            userData.car = result.new_car;
            userData.balance = result.new_balance;
            userData.fuel = result.new_fuel || userData.fuel;

            updateMainScreen();
            updateGarageScreen();
            showNotification(result.message, 'success');
        } else {
            showNotification(result?.error || '❌ Ошибка аренды', 'error');
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

        const result = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/buy-car`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ carId })
        });

        if (result && !result._isError && result.success) {
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
        const result = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/partner`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId })
        });

        if (result && !result._isError && result.success) {
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
    if (userData.stamina >= 100) {
        showNotification('⚡ Вы бодры и полны сил!', 'info');
        return;
    }
    try {
        const result = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/rest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (result && !result._isError && result.success) {
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
            const errorMsg = result?.error || 'Ошибка отдыха';
            if (result && result.canSkip) {
                showNotification(`${errorMsg} ⚡ Можно пропустить за 1500 PLN (4/день)`, 'warning');
                // Optionally show a special button in the notification UI if possible, 
                // but since notification is simple, I'll add paidRest call to a global handler or prompt
                if (confirm(`${errorMsg}\n\nПропустить ожидание за 1500 PLN?`)) {
                    paidRest();
                }
            } else {
                showNotification(`❌ ${errorMsg}`, 'error');
            }
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
async function showScreen(screenName) {
    console.log(`[NAV] Switching to screen: ${screenName}`);

    // v3.4: Hide any active modals/overlays if returning to main or switching main screens
    if (screenName !== 'profile') {
        const modals = ['profile-modal', 'promo-modal', 'ann-modal', 'plates-modal', 'police-modal'];
        modals.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }

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

    // v3.4: Thoroughly clear ALL screens (both classes and manual styles from business/skills)
    Object.entries(screens).forEach(([name, screen]) => {
        if (screen) {
            screen.classList.remove('active');
            // Clear manual display styles that might have been set by old business/skills logic
            if (name !== 'profile') {
                screen.style.display = '';
            }
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

    // Load screen-specific data
    if (screenName === 'orders') {
        await loadUserData();
        await loadDistricts();
        await loadOrders();
    } else if (screenName === 'fuel') {
        updateFuelScreen();
    } else if (screenName === 'garage') {
        updateGarageScreen();
    } else if (screenName === 'business') {
        if (window.businessManager) window.businessManager.loadData();
        // v3.8: hook biz-tab clicks to load data for tabs that need it
        const bizTabs = document.querySelectorAll('.biz-tab');
        bizTabs.forEach(tab => {
            // Remove existing listener to avoid duplicates
            const newTab = tab.cloneNode(true);
            tab.parentNode.replaceChild(newTab, tab);
        });
        document.querySelectorAll('.biz-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                // Toggle active class
                document.querySelectorAll('.biz-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
                const tabContent = document.getElementById(`tab-${tabName}`);
                if (tabContent) tabContent.classList.add('active');
                // Load tab-specific data
                if (tabName === 'investments') loadInvestments();
                if (tabName === 'market') loadFleaMarket();
                if (tabName === 'syndicates' && typeof loadSyndicates === 'function') loadSyndicates();
            });
        });
    } else if (screenName === 'skills') {
        if (window.skillsManager) window.skillsManager.loadData();
    }

    // v6.1.2: Sync Bottom Nav Bar active state
    const navMap = {
        'main': 'nav-home',
        'orders': 'nav-orders',
        'garage': 'nav-garage',
        'business': 'nav-business',
        'profile': 'nav-profile'
    };
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const activeNavId = navMap[screenName];
    if (activeNavId) {
        const activeNav = document.getElementById(activeNavId);
        if (activeNav) activeNav.classList.add('active');
    }
}

// ============= v2.1: ЕЖЕДНЕВНЫЙ БОНУС =============
async function claimDailyBonus() {
    try {
        const result = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/daily-bonus`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (result && !result._isError && result.success) {
            await loadUserData();
            showNotification(`🎁 ${result.reward.label}`, 'success');
        } else if (result && result.timeLeft) {
            const hours = Math.floor(result.timeLeft / (1000 * 60 * 60));
            const minutes = Math.floor((result.timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            showNotification(`⏰ Бонус будет доступен через ${hours}ч ${minutes}м`, 'warning');
        } else {
            showNotification(result?.error || 'Ошибка', 'error');
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

        const result = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/repair`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (result && !result._isError && result.success) {
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
        'plates-btn': () => {
            document.getElementById('plates-modal').style.display = 'block';
            if (typeof loadPlates === 'function') loadPlates();
        },
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

    // v3.4: Add missing back buttons
    const moreBackBtns = {
        'back-from-skills': 'main',
        'back-from-business': 'main'
    };
    Object.entries(moreBackBtns).forEach(([id, screenName]) => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', () => showScreen(screenName));
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

// ============= v6.1.0: CRYPTO & REFERRAL LOGIC =============

async function updateCryptoMarket() {
    try {
        const data = await safeFetchJson(`${API_BASE_URL}/crypto/taxi`);
        if (data && !data._isError) {
            cryptoPrice = data;
            const priceEl = document.getElementById('crypto-current-price');
            if (priceEl) priceEl.textContent = `${data.currentPrice.toFixed(4)} PLN`;
        }
    } catch (e) { console.error('Crypto price fetch failed', e); }
}

async function buyCrypto() {
    const amountPLN = parseFloat(document.getElementById('crypto-buy-amount').value);
    if (isNaN(amountPLN) || amountPLN <= 0) return showNotification('Введите сумму в PLN', 'warning');

    try {
        const result = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/crypto/buy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amountPLN })
        });
        if (result && result.success) {
            userData.balance = result.newBalance;
            userData.crypto_taxi_balance = result.newCryptoBalance;
            updateMainScreen();
            showNotification(result.message, 'success');
        } else {
            showNotification(result?.error || 'Ошибка покупки', 'error');
        }
    } catch (e) { showNotification('Ошибка сети', 'error'); }
}

async function sellCrypto() {
    const amountTaxi = parseFloat(document.getElementById('crypto-sell-amount').value);
    if (isNaN(amountTaxi) || amountTaxi <= 0) return showNotification('Введите кол-во $TAXI', 'warning');

    try {
        const result = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/crypto/sell`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amountTaxi })
        });
        if (result && result.success) {
            userData.balance = result.newBalance;
            userData.crypto_taxi_balance = result.newCryptoBalance;
            updateMainScreen();
            showNotification(result.message, 'success');
        } else {
            showNotification(result?.error || 'Ошибка продажи', 'error');
        }
    } catch (e) { showNotification('Ошибка сети', 'error'); }
}

function copyReferralLink() {
    const input = document.getElementById('referral-link-input');
    if (input) {
        input.select();
        document.execCommand('copy');
        showNotification('🔗 Ссылка скопирована!', 'success');
        if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    }
}

function updateGlobalEventBanner() {
    const banner = document.getElementById('global-event-banner');
    if (!banner || !userData || !userData.active_event) {
        if (banner) banner.style.display = 'none';
        return;
    }

    banner.style.display = 'flex';
    document.getElementById('event-banner-name').textContent = userData.active_event.name;
    document.getElementById('event-banner-desc').textContent = userData.active_event.description;
}

// Start price updates polling
setInterval(updateCryptoMarket, 30000);
updateCryptoMarket();

// ============= v6.1.0: End Advanced Features =============


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

    // v6.1.0: Referral updates
    const refInput = document.getElementById('referral-link-input');
    if (refInput) {
        const baseUrl = window.location.origin + window.location.pathname;
        refInput.value = `${baseUrl}?ref=${TELEGRAM_ID}`;
    }
    const refCountEl = document.getElementById('profile-ref-count');
    if (refCountEl) refCountEl.textContent = userData.referred_count || 0;
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
        const data = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/plates`);
        if (data && !data._isError && data.success) {
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
        const data = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/plates/equip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plateNumber })
        });
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
        const data = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/plates/roll`, { method: 'POST' });
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
        const data = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/plates/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
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

// ============= v3.6: SECONDARY CAR MARKET (БАРАХОЛКА) =============

async function sellCarOnMarket(carId) {
    if (!userData || !userData.owned_cars || userData.owned_cars.length <= 1) {
        return showNotification('Нельзя выставить на продажу свою последнюю машину!', 'error');
    }

    const priceInput = prompt('Введите цену продажи в PLN (налог 5%):');
    if (!priceInput) return;

    const price = parseFloat(priceInput);
    if (isNaN(price) || price <= 0) {
        return showNotification('Некорректная цена', 'error');
    }

    try {
        const data = await safeFetchJson(`${API_BASE_URL}/market/sell`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: TELEGRAM_ID, carId, price })
        });
        if (data.success) {
            showNotification('✅ Машина выставлена на продажу!', 'success');
            // Refresh local data
            const userDataResult = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}`);
            if (userDataResult && !userDataResult._isError) userData = userDataResult;
            updateGarageScreen();
            loadFleaMarket();
        } else {
            showNotification(`❌ ${data.error}`, 'error');
        }
    } catch (e) {
        console.error(e);
        showNotification('Ошибка сети', 'error');
    }
}

async function loadFleaMarket() {
    const list = document.getElementById('flea-market-list');
    if (!list) return;

    list.innerHTML = '<div class="loading">Загрузка барахолки...</div>';

    try {
        const data = await safeFetchJson(`${API_BASE_URL}/market`);
        if (data && !data._isError) {
            if (data.length === 0) {
                list.innerHTML = '<div class="text-center p-4">На барахолке пока нет машин.</div>';
                return;
            }

            // We need CARS object to get the names
            const carsDefReq = await safeFetchJson(`${API_BASE_URL}/configs/cars`);
            const carsDef = (carsDefReq && !carsDefReq._isError) ? Object.fromEntries(carsDefReq.map(c => [c.id, c])) : {};

            list.innerHTML = data.map(item => {
                const car = carsDef[item.car_id] || { name: 'Неизвестная модель', image: '🚗' };
                const isOwner = String(item.seller_id) === String(TELEGRAM_ID);

                let actionBtn = isOwner
                    ? `<button class="action-btn" style="background:#FF3B30;" onclick="cancelFleaMarketListing(${item.id})">Снять с продажи</button>`
                    : `<button class="action-btn" style="background:#34C759;" onclick="buyFleaMarketCar(${item.id}, ${item.price})">Купить</button>`;

                return `
                    <div class="market-investment-card">
                        <div style="font-size: 24px; margin-right: 15px;">${car.image || '🚗'}</div>
                        <div class="inv-info">
                            <div class="inv-name" style="color: #fff; font-weight: bold;">${car.name}</div>
                            <div class="inv-district" style="color: #FFD700;">Цена: ${item.price.toLocaleString()} PLN</div>
                            <div class="inv-revenue" style="font-size: 0.8em; color: #888;">Продавец: ${item.seller_name || 'Неизвестный'}</div>
                        </div>
                        <div class="inv-actions">${actionBtn}</div>
                    </div>
                `;
            }).join('');
        }
    } catch (e) { console.error(e); }
}

async function buyFleaMarketCar(listingId, price) {
    if (!confirm(`Вы уверены, что хотите купить этот авто за ${price.toLocaleString()} PLN?`)) return;

    try {
        const data = await safeFetchJson(`${API_BASE_URL}/market/buy/${listingId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: TELEGRAM_ID })
        });

        if (data.success) {
            showNotification(data.message, 'success');
            userData.balance = data.newBalance;
            updateMainScreen();
            loadFleaMarket();

            // Reload user data to fetch new car
            const userDataResult = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}`);
            if (userDataResult && !userDataResult._isError) userData = userDataResult;
        } else {
            showNotification(`❌ ${data.error}`, 'error');
        }
    } catch (e) {
        console.error(e);
        showNotification('Ошибка сети', 'error');
    }
}

async function cancelFleaMarketListing(listingId) {
    try {
        const data = await safeFetchJson(`${API_BASE_URL}/market/cancel/${listingId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: TELEGRAM_ID })
        });

        if (data.success) {
            showNotification(data.message, 'success');
            loadFleaMarket();
            // Reload user data to retrieve returned car
            const userDataResult = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}`);
            if (userDataResult && !userDataResult._isError) userData = userDataResult;
        } else {
            showNotification(`❌ ${data.error}`, 'error');
        }
    } catch (e) {
        console.error(e);
        showNotification('Ошибка сети', 'error');
    }
}

async function loadMarketPlates() {
    const list = document.getElementById('market-plates-list');
    list.innerHTML = '<div class="loading">Загрузка рынка...</div>';

    try {
        const data = await safeFetchJson(`${API_BASE_URL}/plates/market`);
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
        const data = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/plates/buy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plateNumber })
        });
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
        const data = await safeFetchJson(`${API_BASE_URL}/market/list-plate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: TELEGRAM_ID, plate: plateNumber, price })
        });
        if (data.success) {
            showNotification(data.message, 'success');
            loadPlates();
        } else {
            showNotification(`❌ ${data.error}`, 'error');
        }
    } catch (e) { console.error(e); }
}

// v3.4: Global Social Pulse Logic
async function updateSocialPulse() {
    try {
        const data = await safeFetchJson(`${API_BASE_URL}/social/pulse`);
        if (!data || data._isError) return;

        // 1. Update Community Mission
        if (data.community) {
            const fill = document.getElementById('community-fill');
            const percentEl = document.getElementById('community-percent');
            const distanceEl = document.getElementById('community-distance');
            const goalEl = document.getElementById('community-goal');

            if (fill) fill.style.width = `${data.community.percent}%`;
            if (percentEl) percentEl.textContent = `${data.community.percent}%`;
            if (distanceEl) distanceEl.textContent = data.community.totalDistance.toLocaleString();
            if (goalEl) goalEl.textContent = data.community.goal.toLocaleString();
        }

        // 2. Update Street Feed
        const content = document.getElementById('street-feed-content');
        if (content && data.events && data.events.length > 0) {
            const event = data.events[0]; // Show latest event
            content.style.opacity = '0';
            setTimeout(() => {
                content.textContent = `⚡ ${event.message}`;
                content.style.opacity = '1';
            }, 500);
        }

        // 3. Update District Occupancy (Global variable for use in loadDistricts)
        window.districtPulse = data.occupancy || {};
        window.districtSurges = data.surges || {};

        // If currently on orders screen, refresh UI to show tags
        if (screens.orders.classList.contains('active')) {
            updateDistrictTags();
        }

        // 4. Update Jackpot in profile/header if needed
        if (data.jackpot !== undefined) {
            const jackpotEl = document.getElementById('jackpot-amount');
            if (jackpotEl) jackpotEl.textContent = data.jackpot.toFixed(2);
        }

        // 5. Update Global Event
        if (userData && data.active_event !== undefined) {
            userData.active_event = data.active_event;
            updateGlobalEventBanner();
        }

    } catch (e) {
        console.error('Pulse update failed:', e);
    }
}

function initStreetFeed() {
    updateSocialPulse();
    setInterval(updateSocialPulse, 30000); // Pulse every 30s
}

function updateDistrictTags() {
    document.querySelectorAll('.district-card').forEach(btn => {
        const id = btn.dataset.id;
        if (!id) return;

        // Remove old tags
        btn.querySelector('.district-pulse')?.remove();
        btn.querySelector('.district-surge')?.remove();

        // Add occupancy
        if (window.districtPulse && window.districtPulse[id]) {
            const tag = document.createElement('span');
            tag.className = 'district-pulse';
            tag.textContent = `👥 ${window.districtPulse[id]} водителей`;
            btn.appendChild(tag);
        }

        // Add surge
        if (window.districtSurges && window.districtSurges[id]) {
            const surge = document.createElement('span');
            surge.className = 'district-surge';
            surge.textContent = `🔥 SURGE x${window.districtSurges[id]}`;
            btn.appendChild(surge);
        }
    });
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

/**
 * v6.0.2: Real-time Autonomous Ride Execution
 */
let autonomousTimer = null;
function checkAutonomousRides() {
    if (!userData || !userData.is_autonomous_active) {
        if (autonomousTimer) {
            clearInterval(autonomousTimer);
            autonomousTimer = null;
        }
        return;
    }

    if (!autonomousTimer) {
        // Run a ride every 30 seconds when online for better visualization
        autonomousTimer = setInterval(async () => {
            if (!userData.is_autonomous_active) return;

            try {
                const result = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/autonomous-ride`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (result && !result._isError && result.success) {
                    userData.balance = result.newBalance;
                    userData.fuel = result.fuel;
                    updateMainScreen();
                    showNotification(`🤖 Автопилот: +${result.earnings} PLN`, 'info');

                    // Update Street Feed
                    const feed = document.getElementById('street-feed-content');
                    if (feed) {
                        feed.innerHTML = `🚕 Тесла ${userData.username} выполнила автономный заказ: +${result.earnings} PLN`;
                    }
                } else if (result && result.outOfFuel) {
                    userData.is_autonomous_active = 0;
                    showNotification('🔌 Тесла разряжена. Автопилот выключен.', 'warning');
                    updateGarageScreen();
                    clearInterval(autonomousTimer);
                    autonomousTimer = null;
                }
            } catch (e) {
                console.error('Autonomous ride failed:', e);
            }
        }, 30000);
    }
}

// Update the Pulse to call this check
const originalUpdateSocialPulse = updateSocialPulse;
updateSocialPulse = async function () {
    await originalUpdateSocialPulse();
    checkAutonomousRides();
};

/**
 * v6.0.2: Paid Rest (Skip Cooldown)
 */
async function paidRest() {
    try {
        const result = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/paid-rest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (result && !result._isError && result.success) {
            userData.balance = result.newBalance;
            userData.stamina = 100;
            updateMainScreen();
            showNotification(result.message, 'success');
        } else {
            showNotification(`❌ ${result?.error || 'Ошибка оплаты'}`, 'error');
        }
    } catch (e) {
        console.error('Paid rest failed:', e);
        showNotification('❌ Ошибка соединения', 'error');
    }
}

/**
 * v6.1.2: Navigate to Garage and highlight Autopilot controls
 * Called from order list "К автопилоту" button
 */
async function goToAutopilot() {
    await showScreen('garage');
    // After screen loads, scroll to and highlight the autonomous controls
    setTimeout(() => {
        const autoSection = document.getElementById('garage-autonomous-controls');
        if (autoSection && autoSection.style.display !== 'none') {
            autoSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Brief highlight pulse animation
            autoSection.style.transition = 'box-shadow 0.3s ease';
            autoSection.style.boxShadow = '0 0 0 3px #5856D6, 0 0 20px rgba(88, 86, 214, 0.5)';
            autoSection.style.borderRadius = '12px';
            setTimeout(() => {
                autoSection.style.boxShadow = '';
            }, 2000);
        }
    }, 300);
}

/**
 * v6.0.2: Toggle Autonomous Mode (Tesla)
 */
async function toggleAutonomous() {
    try {
        const result = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/toggle-autonomous`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (result && !result._isError && result.success) {
            userData.is_autonomous_active = result.isActive ? 1 : 0;
            showNotification(result.message, result.isActive ? 'success' : 'info');
            updateGarageScreen(); // Refresh toggle button state
        } else {
            showNotification(`❌ ${result?.error || 'Ошибка'}`, 'error');
        }
    } catch (e) {
        console.error('Toggle autonomous failed:', e);
        showNotification('❌ Ошибка соединения', 'error');
    }
}

/**
 * v6.0.2: Skip 7 Days (Time Jump)
 */
async function skipWeek() {
    if (!confirm('🎡 Пропустить 7 дней за 1500 PLN?\nБудут начислены доходы и списана аренда за неделю.')) return;

    try {
        const result = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/skip-week`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (result && !result._isError && result.success) {
            // Fully reload user data to sync all changes (revenue, rent, days, stamina)
            await loadUserData();
            showNotification(result.message, 'success');
            showScreen('main');
        } else {
            showNotification(`❌ ${result?.error || 'Ошибка пропуска'}`, 'error');
        }
    } catch (e) {
        console.error('Skip week failed:', e);
        showNotification('❌ Ошибка соединения', 'error');
    }
}

// ============= v6.1.2: GLOBAL RIPPLE EFFECT =============
document.addEventListener('click', function (e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.classList.contains('nav-item')) return;
    const ripple = document.createElement('span');
    ripple.classList.add('ripple');
    const rect = btn.getBoundingClientRect();
    ripple.style.left = (e.clientX - rect.left) + 'px';
    ripple.style.top = (e.clientY - rect.top) + 'px';
    if (!btn.style.position || btn.style.position === 'static') btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
}, { passive: true });


// ============= v6.2: WEBSOCKET LIVE BALANCE UPDATES =============
(function initWebSocket() {
    if (!window.TELEGRAM_ID && typeof TELEGRAM_ID === 'undefined') return;

    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProto}//${location.host}`;
    let ws = null;
    let reconnectTimer = null;

    function connect() {
        try {
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                const id = typeof TELEGRAM_ID !== 'undefined' ? TELEGRAM_ID : null;
                if (id) ws.send(JSON.stringify({ type: 'auth', telegramId: id }));
                if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
            };

            ws.onmessage = (evt) => {
                try {
                    const msg = JSON.parse(evt.data);
                    if (msg.type === 'balance_update') {
                        // Update balance in userData silently
                        if (typeof userData !== 'undefined' && userData) {
                            userData.balance = msg.balance;
                            if (msg.stamina !== undefined) userData.stamina = msg.stamina;
                            if (msg.fuel !== undefined) userData.fuel = msg.fuel;
                        }
                        // Update displayed balance
                        if (typeof updateBalanceDisplay === 'function') updateBalanceDisplay();
                        if (typeof updateMainScreen === 'function') updateMainScreen();
                    }
                } catch (e) { }
            };

            ws.onclose = () => {
                // Auto-reconnect after 5s
                reconnectTimer = setTimeout(connect, 5000);
            };

            ws.onerror = () => ws.close();
        } catch (e) { }
    }

    // Wait until app is initialized then connect
    setTimeout(connect, 2000);
})();

// ============= v3.8: ФОНДОВЫЙ РЫНОК (ИНВЕСТИЦИИ) =============

async function loadInvestments() {
    const list = document.getElementById('investments-list');
    if (!list) return;
    list.innerHTML = '<div style="text-align:center; color:#666; padding:20px;">Загрузка...</div>';

    try {
        const stocks = await safeFetchJson(`${API_BASE_URL}/stocks`);
        if (!stocks || stocks._isError || !Array.isArray(stocks)) {
            list.innerHTML = '<div style="color:#ff3b30; padding:20px;">Ошибка загрузки рынка</div>';
            return;
        }

        const portfolio = userData?.stocks_data || {};

        // Calculate portfolio value
        let portfolioValue = 0;
        stocks.forEach(s => {
            if (portfolio[s.symbol]) {
                portfolioValue += (portfolio[s.symbol] * s.price);
            }
        });

        const portfolioSummary = document.getElementById('portfolio-summary');
        const portfolioValueEl = document.getElementById('portfolio-value');
        if (portfolioValue > 0) {
            if (portfolioSummary) portfolioSummary.style.display = 'block';
            if (portfolioValueEl) portfolioValueEl.textContent = `${portfolioValue.toFixed(2)} PLN`;
        } else {
            if (portfolioSummary) portfolioSummary.style.display = 'none';
        }

        list.innerHTML = stocks.map(s => {
            const isUp = s.change_pct >= 0;
            const changeColor = isUp ? '#34C759' : '#ff3b30';
            const changeIcon = isUp ? '▲' : '▼';
            const owned = portfolio[s.symbol] || 0;
            const ownedValue = (owned * s.price).toFixed(2);

            return `
            <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius:14px; padding:14px 16px; margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                    <div>
                        <div style="font-weight:800; font-size:1.05em;">${s.name}</div>
                        <div style="font-size:0.8em; color:#888; margin-top:2px;">${s.symbol}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:1.2em; font-weight:800;">${s.price.toFixed(2)} PLN</div>
                        <div style="color:${changeColor}; font-size:0.85em; font-weight:600;">${changeIcon} ${Math.abs(s.change_pct)}%</div>
                    </div>
                </div>

                ${owned > 0 ? `
                <div style="background:rgba(52,199,89,0.08); border:1px solid rgba(52,199,89,0.15); border-radius:8px; padding:8px 10px; margin-bottom:10px; font-size:0.85em;">
                    📦 В портфеле: <strong>${owned} шт.</strong> · Стоимость: <strong>${ownedValue} PLN</strong>
                </div>` : ''}

                <div style="display:flex; gap:8px; align-items:center;">
                    <input type="number" id="qty-${s.symbol}" min="1" value="1" style="width:60px; padding:6px 8px; border-radius:8px; border:1px solid #444; background:#111; color:#fff; font-size:0.9em;">
                    <button class="action-btn success" style="flex:1; font-size:0.85em;" onclick="buyStock('${s.symbol}', '${s.name}')">🟢 Купить</button>
                    ${owned > 0 ? `<button class="action-btn error" style="flex:1; font-size:0.85em;" onclick="sellStock('${s.symbol}', '${s.name}')">🔴 Продать</button>` : ''}
                </div>
            </div>`;
        }).join('');

    } catch (e) {
        console.error('Stocks load error:', e);
        list.innerHTML = '<div style="color:#ff3b30; padding:20px;">Ошибка соединения</div>';
    }
}

async function buyStock(symbol, name) {
    const qtyInput = document.getElementById(`qty-${symbol}`);
    const quantity = parseInt(qtyInput?.value || 1);
    if (!quantity || quantity <= 0) return showNotification('Укажите количество акций', 'error');

    try {
        const result = await safeFetchJson(`${API_BASE_URL}/stocks/buy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: TELEGRAM_ID, symbol, quantity })
        });
        if (result && result.success) {
            userData.balance = result.new_balance;
            userData.stocks_data = result.portfolio;
            updateMainScreen();
            showNotification(result.message, 'success');
            loadInvestments();
        } else {
            showNotification(result?.error || 'Ошибка покупки', 'error');
        }
    } catch (e) {
        showNotification('Ошибка соединения', 'error');
    }
}

async function sellStock(symbol, name) {
    const qtyInput = document.getElementById(`qty-${symbol}`);
    const quantity = parseInt(qtyInput?.value || 1);
    if (!quantity || quantity <= 0) return showNotification('Укажите количество акций', 'error');

    try {
        const result = await safeFetchJson(`${API_BASE_URL}/stocks/sell`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: TELEGRAM_ID, symbol, quantity })
        });
        if (result && result.success) {
            userData.balance = result.new_balance;
            userData.stocks_data = result.portfolio;
            updateMainScreen();
            showNotification(result.message, 'success');
            loadInvestments();
        } else {
            showNotification(result?.error || 'Ошибка продажи', 'error');
        }
    } catch (e) {
        showNotification('Ошибка соединения', 'error');
    }
}

// ============= v4.0: СИНДИКАТЫ =============

async function loadSyndicates() {
    const list = document.getElementById('syndicates-list');
    if (!list) return;
    list.innerHTML = '<div style="text-align:center;color:#666;padding:20px;">Загрузка...</div>';

    try {
        const mineData = await safeFetchJson(`${API_BASE_URL}/syndicates/mine?telegramId=${TELEGRAM_ID}`);
        const myBlock = document.getElementById('my-syndicate-block');
        const noBlock = document.getElementById('no-syndicate-block');

        if (mineData && mineData.syndicate) {
            const syn = mineData.syndicate;
            document.getElementById('my-syn-name').textContent = syn.name;
            document.getElementById('my-syn-desc').textContent = syn.description || '—';
            document.getElementById('my-syn-members').textContent = syn.member_count || 0;
            document.getElementById('my-syn-treasury').textContent = Math.round(syn.treasury).toLocaleString();
            document.getElementById('my-syn-score').textContent = syn.score;
            document.getElementById('my-syn-role').textContent = mineData.role === 'leader' ? '👑 Лидер' : '👤 Участник';
            if (syn.members && syn.members.length > 0) {
                document.getElementById('syn-members-list').innerHTML =
                    '<div style="margin-top:10px;font-weight:600;margin-bottom:6px;">Участники:</div>' +
                    syn.members.map(m =>
                        `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                            <span>${m.role === 'leader' ? '👑 ' : ''}${m.username || m.telegram_id}</span>
                            <span style="color:#aaa;">💰 ${Math.round(m.contributed).toLocaleString()} PLN</span>
                        </div>`
                    ).join('');
            }
            if (myBlock) myBlock.style.display = 'block';
            if (noBlock) noBlock.style.display = 'none';
        } else {
            if (myBlock) myBlock.style.display = 'none';
            if (noBlock) noBlock.style.display = 'block';
        }

        const syndicates = await safeFetchJson(`${API_BASE_URL}/syndicates`);
        if (!syndicates || !Array.isArray(syndicates)) {
            list.innerHTML = '<div style="color:#ff3b30;padding:20px;">Ошибка загрузки</div>';
            return;
        }
        const isMember = !!(mineData && mineData.syndicate);
        list.innerHTML = syndicates.length === 0
            ? '<div style="text-align:center;color:#666;padding:20px;">Синдикаты ещё не созданы</div>'
            : syndicates.map((syn, idx) => {
                const myMembership = mineData?.syndicate?.id === syn.id;
                return `
                <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px 14px;margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
                        <div>
                            <span style="color:#ff9f0a;font-size:1em;margin-right:6px;">#${idx + 1}</span>
                            <strong>${syn.name}</strong>
                            ${myMembership ? '<span style="background:rgba(255,159,10,0.2);color:#ff9f0a;font-size:0.75em;padding:2px 8px;border-radius:10px;margin-left:6px;">Мой</span>' : ''}
                        </div>
                        <span style="color:#888;font-size:0.85em;">👥 ${syn.member_count}/20</span>
                    </div>
                    <div style="font-size:0.82em;color:#999;margin-bottom:8px;">${syn.description || 'Нет описания'}</div>
                    <div style="display:flex;gap:10px;font-size:0.8em;flex-wrap:wrap;margin-bottom:10px;">
                        <span>🏆 Очков: <strong>${syn.score}</strong></span>
                        <span>💰 Казна: <strong>${Math.round(syn.treasury).toLocaleString()} PLN</strong></span>
                    </div>
                    ${!isMember ? `<button class="action-btn" style="font-size:0.85em;width:100%;" onclick="joinSyndicate(${syn.id})">🤝 Вступить</button>` : ''}
                </div>`;
            }).join('');
    } catch (e) {
        console.error('Syndicates load error:', e);
        if (list) list.innerHTML = '<div style="color:#ff3b30;padding:20px;">Ошибка соединения</div>';
    }
}

async function createSyndicate() {
    const name = document.getElementById('syn-create-name')?.value?.trim();
    const description = document.getElementById('syn-create-desc')?.value?.trim();
    if (!name || name.length < 3) return showNotification('Название минимум 3 символа', 'error');
    try {
        const result = await safeFetchJson(`${API_BASE_URL}/syndicates/create`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: TELEGRAM_ID, name, description })
        });
        if (result && result.success) {
            userData.balance = result.new_balance;
            updateMainScreen();
            showNotification(result.message, 'success');
            loadSyndicates();
        } else { showNotification(result?.error || 'Ошибка создания', 'error'); }
    } catch (e) { showNotification('Ошибка соединения', 'error'); }
}

async function joinSyndicate(synId) {
    try {
        const result = await safeFetchJson(`${API_BASE_URL}/syndicates/join/${synId}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: TELEGRAM_ID })
        });
        if (result && result.success) { showNotification(result.message, 'success'); loadSyndicates(); }
        else { showNotification(result?.error || 'Ошибка', 'error'); }
    } catch (e) { showNotification('Ошибка соединения', 'error'); }
}

async function leaveSyndicate() {
    if (!confirm('Выйти из синдиката?')) return;
    try {
        const result = await safeFetchJson(`${API_BASE_URL}/syndicates/leave`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: TELEGRAM_ID })
        });
        if (result && result.success) { showNotification(result.message, 'success'); loadSyndicates(); }
        else { showNotification(result?.error || 'Ошибка', 'error'); }
    } catch (e) { showNotification('Ошибка соединения', 'error'); }
}

async function contributeSyndicate() {
    const amtStr = prompt('Сколько PLN внести в казну синдиката?');
    if (!amtStr) return;
    const amount = parseFloat(amtStr);
    if (isNaN(amount) || amount <= 0) return showNotification('Неверная сумма', 'error');
    try {
        const result = await safeFetchJson(`${API_BASE_URL}/syndicates/contribute`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: TELEGRAM_ID, amount })
        });
        if (result && result.success) {
            userData.balance = result.new_balance;
            updateMainScreen();
            showNotification(result.message, 'success');
            loadSyndicates();
        } else { showNotification(result?.error || 'Ошибка', 'error'); }
    } catch (e) { showNotification('Ошибка соединения', 'error'); }
}

// ============= TURF WARS (ЗАХВАТ РАЙОНОВ) =============
let selectedDistrictForInvestment = null;

async function openTurfWarsMap() {
    const modal = document.getElementById('turf-wars-modal');
    if (modal) {
        modal.style.display = 'block';
        document.getElementById('turf-invest-block').style.display = 'none';
        await renderTurfWarsMap();
    }
}

async function renderTurfWarsMap() {
    const list = document.getElementById('districts-list');
    if (!list) return;

    list.innerHTML = '<div class="loading">Загрузка карты...</div>';
    try {
        const districts = await safeFetchJson(`${API_BASE_URL}/syndicates/districts`);
        if (!districts || districts.error) {
            list.innerHTML = '<div class="error">Ошибка загрузки районов</div>';
            return;
        }

        list.innerHTML = districts.map(d => {
            const isOurs = mySyndicateData && d.controlling_syndicate_id === mySyndicateData.id;
            const controllerName = d.controlling_syndicate_name || 'Никто (Нейтрально)';
            const color = isOurs ? '#34C759' : (d.controlling_syndicate_id ? '#ff3b30' : '#888');

            return `
                <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; border-left: 4px solid ${color};">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <strong style="color: white; font-size: 1.1em;">${d.name}</strong>
                        <span style="color: ${color}; font-size: 0.85em; background: rgba(0,0,0,0.3); padding: 3px 8px; border-radius: 12px;">
                            Владелец: ${controllerName}
                        </span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9em; color: #ccc;">
                        <span>Очки контроля: <strong>${Math.floor(d.capture_points)}</strong></span>
                        <button class="action-btn" style="padding: 5px 15px; background: rgba(255,159,10,0.2); color: #ff9f0a; border: 1px solid #ff9f0a;" onclick="prepareTurfInvestment('${d.id}', '${d.name}')">
                            ${isOurs ? 'Укрепить' : 'Захватить'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        list.innerHTML = '<div class="error">Ошибка сервера</div>';
    }
}

function prepareTurfInvestment(districtId, districtName) {
    if (!mySyndicateData) {
        showNotification('Вы не состоите в синдикате', 'error');
        return;
    }
    selectedDistrictForInvestment = districtId;
    const block = document.getElementById('turf-invest-block');
    document.getElementById('invest-district-name').innerText = `База: ${districtName}`;
    document.getElementById('turf-invest-amount').value = '';
    block.style.display = 'block';
    block.scrollIntoView({ behavior: 'smooth' });
}

async function submitTurfInvestment() {
    if (!selectedDistrictForInvestment || !mySyndicateData) return;

    const amountInput = document.getElementById('turf-invest-amount');
    const amount = parseFloat(amountInput.value);

    if (isNaN(amount) || amount <= 0) {
        showNotification('Введите корректную сумму', 'error');
        return;
    }

    // mySyndicateData is global in script.js when user opens syndicate tab
    if (amount > mySyndicateData.treasury) {
        showNotification('В казне Синдиката недостаточно средств!', 'error');
        return;
    }

    try {
        const result = await safeFetchJson(`${API_BASE_URL}/syndicates/districts/capture`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: TELEGRAM_ID, districtId: selectedDistrictForInvestment, amount })
        });

        if (result && result.success) {
            showNotification(result.message, 'success');
            document.getElementById('turf-invest-block').style.display = 'none';
            await renderTurfWarsMap();
            loadSyndicates(); // Refresh mySyndicateData to update treasury display
        } else {
            showNotification(result?.error || 'Ошибка', 'error');
        }
    } catch (e) {
        console.error(e);
        showNotification('Ошибка сети', 'error');
    }
}
