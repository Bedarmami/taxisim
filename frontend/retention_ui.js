// Retention UI Overrides & Enhancements
// Retention UI Overrides & Enhancements
const RETENTION_API_URL = '/api';


const AGGREGATOR_INFO = {
    yodex: { name: '🚖 Yodex', color: '#f1c40f', class: 'yodex' },
    ubar: { name: '🖤 Ubar', color: '#bdc3c7', class: 'ubar' },
    volt: { name: '⚡ Volt', color: '#9b59b6', class: 'volt' }
};

let currentAggregator = 'yodex';
window.capturedOrders = []; // Store orders here since we can't access script.js scope

// --- Monkey Patch Fetch to Capture Orders ---
const originalFetch = window.fetch;
window.fetch = async function (...args) {
    const response = await originalFetch(...args);

    // Check if this is an orders fetch
    const url = args[0];
    if (typeof url === 'string' && url.includes('/api/orders/')) {
        try {
            const clone = response.clone();
            const data = await clone.json();
            console.log('📦 Orders Captured by Retention UI:', data);
            window.capturedOrders = data;
            // Force display update
            setTimeout(() => {
                if (window.displayOrders) window.displayOrders();
            }, 100);
        } catch (e) {
            console.error('Error capturing orders:', e);
        }
    }

    return response;
};

// --- Override Display Orders ---
window.displayOrders = function () {
    console.log('🎨 Rendering Premium Retention UI Orders');
    const list = document.getElementById('orders-list');
    if (!list) return;
    list.innerHTML = '';

    // Aggregator Selector
    let aggSelector = document.getElementById('aggregator-selector');
    if (!aggSelector) {
        aggSelector = document.createElement('div');
        aggSelector.id = 'aggregator-selector';
        aggSelector.className = 'aggregator-selector';
        aggSelector.innerHTML = `
            <button class="agg-btn ${currentAggregator === 'yodex' ? 'active' : ''}" data-agg="yodex">🚖 Yodex</button>
            <button class="agg-btn ${currentAggregator === 'ubar' ? 'active' : ''}" data-agg="ubar">🖤 Ubar</button>
            <button class="agg-btn ${currentAggregator === 'volt' ? 'active' : ''}" data-agg="volt">⚡ Volt</button>
        `;
        list.parentElement.insertBefore(aggSelector, list);

        aggSelector.querySelectorAll('.agg-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                currentAggregator = e.target.dataset.agg;
                aggSelector.querySelectorAll('.agg-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                window.displayOrders();
            });
        });
    }

    // Use captured orders
    const orders = window.capturedOrders || [];

    if (orders.length === 0) {
        list.innerHTML = `
            <div class="empty-state" style="text-align:center; padding: 40px; color: #777;">
                <div style="font-size: 3em; margin-bottom: 15px;">📭</div>
                <div>Нет доступных заказов...</div>
                <div style="font-size: 0.9em; margin-top: 5px;">Попробуйте подождать или сменить район</div>
            </div>
        `;
        return;
    }

    // Filter Logic
    // Access global currentFilter if possible, else default 'all'
    const filter = window.currentFilter || 'all';
    let filtered = orders;

    if (filter !== 'all') {
        filtered = orders.filter(o => {
            const price = (o.prices && o.prices[currentAggregator]) || o.price;
            if (filter === 'vip') return o.is_vip;
            if (filter === 'cheap') return price < 50;
            if (filter === 'expensive') return price >= 50;
            return true;
        });
    }

    filtered.forEach((order, index) => {
        const div = document.createElement('div');
        div.className = `order-card ${order.is_vip ? 'vip-order' : ''} ${order.type === 'contraband' ? 'contraband-order' : ''}`;

        let price = (order.prices && order.prices[currentAggregator]) || order.price;
        price = Math.floor(price); // Round for cleaner look

        const agg = AGGREGATOR_INFO[currentAggregator];

        // Description/Details
        const distance = order.distance.toFixed(1);
        const description = order.description ? `<div style="margin-top:5px; font-style:italic;">"${order.description}"</div>` : '';

        div.innerHTML = `
            <div class="order-header">
                <div>
                    <span class="order-price">${price} PLN</span>
                    ${order.is_vip ? '<span class="vip-badge" style="margin-left:8px;">💎 VIP</span>' : ''}
                </div>
                <span class="agg-badge" style="color:${agg.color}; font-weight:bold; font-size:0.85em;">${agg.name}</span>
            </div>
            
            <div class="order-route">
                <div style="display:flex; align-items:center;">
                    <span style="font-size:1.2em; margin-right:8px;">📍</span> 
                    <b>${order.from}</b>
                </div>
                <div style="margin-left: 23px; color:#555; font-size:0.8em;">⬇ ${distance} км</div>
                <div style="display:flex; align-items:center;">
                    <span style="font-size:1.2em; margin-right:8px;">🏁</span> 
                    <b>${order.to}</b>
                </div>
            </div>

            <div class="order-details">
                ${description}
                ${order.type === 'contraband' ? '<div style="color:#e74c3c; font-weight:bold; margin-top:5px;">⚠️ Нелегальный груз</div>' : ''}
            </div>

            <button class="take-order-btn" onclick="takeOrderRetention(${index})">
                ${order.type === 'contraband' ? '🚔 РИСКНУТЬ' : '🚀 Принять заказ'}
            </button>
        `;
        list.appendChild(div);
    });
};

/* Wrapper for Take Order to support captured data mapping */
window.takeOrderRetention = function (index) {
    // We need to map the index from our filtered/captured list back to the original concept if needed
    // But mostly likely script.js expects index in currentOrders.
    // Since we monkey-patched fetch, window.capturedOrders IS what script.js has (logically).
    // So index should match. 
    if (window.takeOrder) window.takeOrder(index);
};

/* Override Update Main Screen to add Retention Stats */
if (!window.originalUpdateMainScreen) {
    window.originalUpdateMainScreen = window.updateMainScreen;
}

window.updateMainScreen = function () {
    if (window.originalUpdateMainScreen) window.originalUpdateMainScreen();

    // Inject Stats UI if not present
    const statsContainer = document.querySelector('.user-stats') || document.querySelector('.status-card');

    // Add Cleanliness/Tires bars if missing
    // Try to find elements by ID first
    const cleanEl = document.getElementById('cleanliness');
    if (!cleanEl && statsContainer) {
        // Inject HTML
        const hardcoreDiv = document.createElement('div');
        hardcoreDiv.className = 'hardcore-stats';
        hardcoreDiv.style.marginTop = '15px';
        hardcoreDiv.innerHTML = `
            <div class="hardcore-stat">
                <span title="Чистота">✨</span>
                <div class="stat-bar"><div id="cleanliness-bar" class="stat-fill" style="width: 100%"></div></div>
            </div>
            <div class="hardcore-stat">
                <span title="Состояние шин">🍩</span>
                <div class="stat-bar"><div id="tires-bar" class="stat-fill" style="width: 100%"></div></div>
            </div>
        `;
        statsContainer.appendChild(hardcoreDiv);
    }

    // Update logic
    // We access user data from window (script.js global userData? or fetch?)
    // script.js usually has 'userData' global.
    // We can try to access it if it's there. 
    // If not, we might need to fetch our own users data.
    // Let's rely on DOM elements if script.js updated them, or userData if available.
    if (typeof window.userData !== 'undefined' && window.userData) {
        const clean = window.userData.cleanliness || 100;
        const tires = window.userData.tire_condition || 100;

        const cleanBar = document.getElementById('cleanliness-bar');
        if (cleanBar) {
            cleanBar.style.width = `${clean}%`;
            cleanBar.className = `stat-fill ${clean < 50 ? 'danger' : (clean < 80 ? 'warn' : '')}`;
        }

        const tireBar = document.getElementById('tires-bar');
        if (tireBar) {
            tireBar.style.width = `${tires}%`;
            tireBar.className = `stat-fill ${tires < 50 ? 'danger' : (tires < 80 ? 'warn' : '')}`;
        }
    }

    updateJackpotTicker();
};

async function updateJackpotTicker() {
    try {
        const data = await safeFetchJson(`${RETENTION_API_URL}/jackpot`);
        if (data && !data._isError && data.current) {
            const ticker = document.getElementById('jackpot-amount');
            if (ticker) ticker.textContent = data.current.toFixed(2);
        }
    } catch (e) { console.error('Jackpot error', e); }
}

// Ensure initial fetch if needed
setTimeout(() => {
    // If no orders after 2 seconds, force a fetch
    if (!window.capturedOrders || window.capturedOrders.length === 0) {
        console.log('🔄 Forced fetch of orders by Retention UI');
        // Trigger whatever script.js uses, or manual fetch
        // API: /orders/:id
        if (typeof window.userData !== 'undefined') {
            // We can use telegramId
            const tid = window.userData.telegram_id || (window.Telegram?.WebApp?.initDataUnsafe?.user?.id);
            if (tid) {
                safeFetchJson(`${RETENTION_API_URL}/orders/${tid}?district=suburbs&count=5`);
            }
        }
    }
}, 2000);
