let adminPassword = localStorage.getItem('adminPassword') || '';
let charts = {};

function openTab(evt, tabName) {
    const tabcontents = document.getElementsByClassName("tab-content");
    for (let i = 0; i < tabcontents.length; i++) tabcontents[i].style.display = "none";

    const tablinks = document.getElementsByClassName("tab-link");
    for (let i = 0; i < tablinks.length; i++) tablinks[i].classList.remove("active");

    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.classList.add("active");

    if (tabName === 'tab-dashboard') loadAnalytics();
    if (tabName === 'tab-promo') loadPromos();
    if (tabName === 'tab-logs') loadLogs();
    if (tabName === 'tab-users') loadUsers();
    if (tabName === 'tab-announcement') loadAnnouncement();
    if (tabName === 'tab-jackpot') loadJackpotTab();
    if (tabName === 'tab-containers') loadContainersTab();
    if (tabName === 'tab-cars-editor') loadCarDefinitions();
    if (tabName === 'tab-settings') loadGlobalSettings();
    if (tabName === 'tab-activities') loadActivities();
    if (tabName === 'tab-support') loadSupportMessages();
    if (tabName === 'tab-gas-stations') loadAdminGasStations();
    if (tabName === 'tab-plates') loadAdminPlates();
    if (tabName === 'tab-live-config') loadConfigs();
    if (tabName === 'tab-car-profit') loadCarProfitability();
    if (tabName === 'tab-events') loadEventsAdmin();
    if (tabName === 'tab-crypto') loadCryptoAdmin();
}

async function checkAuth() {
    if (!adminPassword) {
        document.getElementById('login-section').style.display = 'flex';
        document.getElementById('admin-info').style.display = 'none';
        document.getElementById('main-content').style.display = 'none';
        return;
    }

    try {
        const response = await safeFetchJson('/api/admin/stats', {
            headers: { 'x-admin-password': adminPassword }
        });

        if (response && !response._isError) {
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('admin-info').style.display = 'block';
            document.getElementById('main-content').style.display = 'block';
            document.getElementById('maintenance-control').style.display = 'flex';

            const mData = await safeFetchJson('/api/admin/maintenance-status', { headers: { 'x-admin-password': adminPassword } });
            if (mData && !mData._isError) {
                document.getElementById('maintenance-toggle').checked = mData.maintenanceMode;
            }
            // Broadcast logic
            document.getElementById('broadcast-form')?.addEventListener('submit', async (e) => {
                e.preventDefault();
                const msg = document.getElementById('broadcast-message').value;
                const imageUrl = document.getElementById('broadcast-image').value;
                if (!confirm('Вы уверены, что хотите отправить это сообщение ВСЕМ пользователям?')) return;

                try {
                    const data = await safeFetchJson(`/api/admin/broadcast`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
                        body: JSON.stringify({ message: msg, imageUrl: imageUrl })
                    });
                    if (data && !data._isError) {
                        alert(data.message || 'Рассылка завершена');
                        e.target.reset();
                    } else {
                        alert('Ошибка при рассылке: ' + (data?.error || 'Unknown'));
                    }
                } catch (e) {
                    alert('Ошибка при рассылке');
                }
            });


            loadData();
        } else {
            alert('Неверный пароль');
            logout();
        }
    } catch (e) {
        console.error(e);
        alert('Ошибка сервера');
    }
}

function login() {
    const pass = document.getElementById('admin-pass').value;
    if (!pass) return alert('Введите пароль');
    adminPassword = pass;
    localStorage.setItem('adminPassword', pass);
    checkAuth();
}

function logout() {
    localStorage.removeItem('adminPassword');
    adminPassword = '';
    location.reload();
}

async function loadData() {
    await loadStats();
    await loadAnalytics();
    await loadDebugInfo();
    loadAdminGasStations();
}

async function loadAdminGasStations() {
    const table = document.getElementById('admin-gas-stations-tbody');
    if (!table) return;
    table.innerHTML = '<tr><td colspan="10">Загрузка...</td></tr>';

    try {
        const stations = await safeFetchJson('/api/admin/gas-stations', {
            headers: { 'x-admin-password': adminPassword }
        });
        if (!stations || stations._isError) return;

        table.innerHTML = '';

        // Populate the manual bot trigger dropdown
        const npcSelect = document.getElementById('npc-target-station');
        if (npcSelect) {
            // Keep the 'ALL' option
            npcSelect.innerHTML = '<option value="ALL">🌐 Все АЗС (глобальный трафик)</option>';
        }

        stations.forEach(s => {
            const tr = document.createElement('tr');

            // Populate select dropdown
            if (npcSelect && s.owner_id) {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = `${s.name} (${s.owner_name})`;
                npcSelect.appendChild(opt);
            }

            // Foreclosure highlighting
            let balanceColor = '#fff';
            let rowStyle = '';
            if (s.owner_id) {
                if (s.owner_balance < 40) {
                    balanceColor = '#ff4d4d'; // Red alert
                    rowStyle = 'background: rgba(255, 77, 77, 0.1);';
                } else if (s.owner_balance < 100) {
                    balanceColor = '#f39c12'; // Warning orange
                }
            }

            tr.style.cssText = rowStyle;
            tr.innerHTML = `
                <td>${s.id}</td>
                <td>${s.name}</td>
                <td>${s.owner_name ? `<b>${s.owner_name}</b> (<code style="font-size:0.8em;">${s.owner_id}</code>)` : '<i style="color:#888;">Нет владельца</i>'}</td>
                <td style="color:${balanceColor}; font-weight:bold;">${s.owner_id ? (s.owner_balance || 0).toFixed(2) + ' PLN' : '-'}</td>
                <td>${s.fuel_stock.toFixed(1)}</td>
                <td>${s.uncollected_revenue.toFixed(2)}</td>
                <td>${s.revenue_total.toFixed(2)}</td>
                <td>${s.price_petrol} / ${s.price_gas}</td>
                <td>
                    <div style="display:flex; gap:5px; flex-wrap:wrap;">
                        ${s.owner_id ? `<button onclick="takeAwayStation('${s.id}')" class="danger-btn" style="padding:4px 8px; font-size:0.8em;">Забрать</button>` : ''}
                        ${s.owner_id ? `<button onclick="bankruptStation('${s.id}')" class="danger-btn" style="padding:4px 8px; font-size:0.8em; background:#d35400;">Банкрот</button>` : ''}
                        <button onclick="giveStationStock('${s.id}')" class="edit-btn" style="padding:4px 8px; font-size:0.8em;">+100л</button>
                        <button onclick="setStationStock('${s.id}')" class="edit-btn" style="padding:4px 8px; font-size:0.8em; background:#3498db;">Уст. Запас</button>
                    </div>
                </td>
            `;
            table.appendChild(tr);
        });
    } catch (e) {
        console.error('Error loading stations:', e);
        table.innerHTML = '<tr><td colspan="10">Ошибка загрузки</td></tr>';
    }
}

async function triggerNPCBots() {
    const stationId = document.getElementById('npc-target-station').value;
    const litersInput = document.getElementById('npc-target-liters').value;
    const liters = litersInput ? parseInt(litersInput) : null;

    if (!confirm(`🚀 Запустить ботов на: ${stationId === 'ALL' ? 'ВЕХ АЗС' : stationId}?\nОбъем: ${liters ? liters + ' л.' : 'Случайный (10-50л)'}`)) return;

    try {
        const res = await safeFetchJson('/api/admin/gas-stations/bots', {
            method: 'POST',
            headers: { 'x-admin-password': adminPassword, 'Content-Type': 'application/json' },
            body: JSON.stringify({ stationId, liters })
        });

        if (res.success) {
            alert(`✅ БОТЫ ЗАВЕРШИЛИ ПОКУПКИ!\nКуплено литров: ${res.sold} L\nВладельцы получили: ${res.revenue.toFixed(2)} PLN`);
            loadAdminGasStations();
        } else {
            alert(`Произошла ошибка при запуске ботов: ${res.error}`);
        }
    } catch (e) {
        alert('Ошибка связи с сервером');
    }
}

async function bankruptStation(stationId) {
    if (!confirm('ВЫ УВЕРЕНЫ? АЗС будет немедленно конфискована и выставлена на рынок.')) return;
    try {
        const res = await safeFetchJson('/api/admin/gas-stations/bankrupt', {
            method: 'POST',
            headers: { 'x-admin-password': adminPassword, 'Content-Type': 'application/json' },
            body: JSON.stringify({ stationId })
        });
        if (res.success) loadAdminGasStations();
    } catch (e) { alert('Ошибка'); }
}

async function setStationStock(stationId) {
    const liters = prompt('Укажите точный запас топлива (л):');
    if (liters === null || isNaN(liters)) return;
    try {
        const res = await safeFetchJson('/api/admin/gas-stations/set-stock', {
            method: 'POST',
            headers: { 'x-admin-password': adminPassword, 'Content-Type': 'application/json' },
            body: JSON.stringify({ stationId, liters: parseFloat(liters) })
        });
        if (res.success) loadAdminGasStations();
    } catch (e) { alert('Ошибка'); }
}

async function takeAwayStation(stationId) {
    if (!confirm('Вы уверены, что хотите забрать эту АЗС у владельца? Все доходы и топливо будут сброшены.')) return;
    try {
        const res = await safeFetchJson('/api/admin/gas-stations/take-away', {
            method: 'POST',
            headers: { 'x-admin-password': adminPassword, 'Content-Type': 'application/json' },
            body: JSON.stringify({ stationId })
        });
        if (res.success) loadAdminGasStations();
    } catch (e) { alert('Ошибка'); }
}

async function giveStationStock(stationId) {
    const liters = prompt('Сколько литров добавить?');
    if (!liters || isNaN(liters)) return;
    try {
        const res = await safeFetchJson('/api/admin/gas-stations/give-stock', {
            method: 'POST',
            headers: { 'x-admin-password': adminPassword, 'Content-Type': 'application/json' },
            body: JSON.stringify({ stationId, liters: parseFloat(liters) })
        });
        if (res.success) loadAdminGasStations();
    } catch (e) { alert('Ошибка'); }
}

async function loadDebugInfo() {
    try {
        const data = await safeFetchJson('/api/admin/debug-info', { headers: { 'x-admin-password': adminPassword } });
        if (!data || data._isError) return;

        document.getElementById('debug-users').textContent = data.database.users;
        document.getElementById('debug-bot').textContent = data.bot.tokenPresent ? '✅ OK' : '❌ NO TOKEN';
        document.getElementById('debug-bot').style.color = data.bot.tokenPresent ? '#00ff00' : '#ff0000';
    } catch (e) { console.error('Debug info fail:', e); }
}

async function loadStats() {
    const response = await fetch('/api/admin/stats', {
        headers: { 'x-admin-password': adminPassword }
    });
    const data = await response.json();
    document.getElementById('total-users').textContent = data.totalUsers;
    document.getElementById('total-earned').textContent = data.totalEarned + ' PLN';
    document.getElementById('total-rides').textContent = data.totalRides;
    document.getElementById('total-balance').textContent = data.totalBalance + ' PLN';
}

async function loadAnalytics() {
    try {
        const res = await fetch('/api/admin/analytics', { headers: { 'x-admin-password': adminPassword } });
        const data = await res.json();

        // 🛡️ Robust chart initialization
        try {
            if (data.registrations) initChart('regChart', 'Регистрации', data.registrations, '#0088cc');
            if (data.rides) initChart('ridesChart', 'Поездки', data.rides, '#34b545');
            if (data.earnings) initChart('earningsChart', 'Доход PLN', data.earnings, '#FFD700');
        } catch (chartErr) { console.error('Chart init error:', chartErr); }

        // Retention / Active Users
        const statsRet = document.getElementById('stats-retention');
        if (statsRet) statsRet.textContent = `${data.dau || 0} / ${data.wau || 0}`;

        // Economy Inflow
        const economyInflowEl = document.getElementById('economy-inflow');
        if (economyInflowEl && data.economy) {
            economyInflowEl.textContent = (data.economy.inflow7d || 0) + ' PLN';
        }
    } catch (e) {
        console.error('Analytics load error:', e);
    }

    // Load Wealthiest and Status even if charts fail
    loadWealthiest();
    loadBotStatus();
}

async function loadBotStatus() {
    const data = await safeFetchJson('/api/admin/bot-status', { headers: { 'x-admin-password': adminPassword } });
    if (!data || data._isError) return;

    // For now we just console log or update a small status if we had one
    // Let's add it to the console for debug and eventually to UI
    console.log('Bot Status:', data);
}

async function loadWealthiest() {
    const data = await safeFetchJson('/api/admin/wealthiest', { headers: { 'x-admin-password': adminPassword } });
    if (!data || data._isError) return;

    const tbody = document.getElementById('wealth-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    data.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.username || p.telegram_id}</td>
            <td style="color: #34b545; font-weight: bold;">${p.balance.toFixed(2)}</td>
            <td>${p.level}</td>
        `;
        tbody.appendChild(tr);
    });
}

function initBarChart(id, label, data) {
    if (charts[id]) charts[id].destroy();
    const ctx = document.getElementById(id).getContext('2d');
    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.district_id),
            datasets: [{
                label: label,
                data: data.map(d => d.count),
                backgroundColor: 'rgba(243, 156, 18, 0.5)',
                borderColor: '#f39c12',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

async function loadActivities() {
    const userId = document.getElementById('filter-user-id')?.value || '';
    const action = document.getElementById('filter-action')?.value || '';
    let url = '/api/admin/activities';
    const params = [];
    if (userId) params.push(`userId=${userId}`);
    if (action) params.push(`action=${action}`);
    if (params.length > 0) url += '?' + params.join('&');

    const activities = await safeFetchJson(url, { headers: { 'x-admin-password': adminPassword } });
    if (!activities || activities._isError) return;

    const tbody = document.getElementById('activities-tbody');
    tbody.innerHTML = '';
    activities.forEach(a => {
        const tr = document.createElement('tr');
        if (a.is_suspicious) {
            tr.style.background = 'rgba(255, 0, 0, 0.15)';
            tr.title = 'Suspicious: ' + (a.reason || 'Logic check');
        }

        let details = {};
        try {
            details = typeof a.details === 'string' ? JSON.parse(a.details) : a.details;
        } catch (e) { details = { raw: a.details }; }

        let detailStr = '';
        for (let k in details) detailStr += `${k}: ${details[k]} `;

        tr.innerHTML = `
            <td>${new Date(a.timestamp).toLocaleString()}</td>
            <td>${a.user_id}</td>
            <td><span class="status-badge action-${a.action}">${a.action}</span></td>
            <td><small>${detailStr}</small></td>
        `;

        if (a.action === 'ALARM_EXPLOIT') {
            tr.style.backgroundColor = 'rgba(255, 68, 68, 0.15)';
            tr.style.fontWeight = 'bold';
        }

        tbody.appendChild(tr);
    });
}

function initChart(id, label, data, color) {
    if (charts[id]) charts[id].destroy();
    const ctx = document.getElementById(id).getContext('2d');
    charts[id] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.date.split('-').slice(1).join('.')),
            datasets: [{
                label: label,
                data: data.map(d => d.count),
                borderColor: color,
                backgroundColor: color + '22',
                tension: 0.3,
                fill: true
            }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });
}

async function toggleMaintenance(active) {
    const data = await safeFetchJson('/api/admin/maintenance', {
        method: 'POST',
        headers: { 'x-admin-password': adminPassword, 'Content-Type': 'application/json' },
        body: JSON.stringify({ active })
    });
    if (data && !data._isError) {
        alert(`Режим техработ ${active ? 'ВКЛЮЧЕН' : 'ВЫКЛЮЧЕН'}`);
    } else {
        alert('Ошибка переключения режима');
    }
}

async function loadUsers() {
    const users = await safeFetchJson('/api/admin/users', { headers: { 'x-admin-password': adminPassword } });
    if (!users || users._isError) return;

    const tbody = document.getElementById('user-tbody');
    tbody.innerHTML = '';
    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${u.telegram_id}</td>
            <td>${u.level}</td>
            <td>${u.balance.toFixed(2)}</td>
            <td>${u.fuel.toFixed(1)}</td>
            <td>${u.stamina}%</td>
            <td>${u.rides_total}</td>
            <td>${u.last_login ? new Date(u.last_login).toLocaleString() : '---'}</td>
            <td>
                <button class="edit-btn" onclick="openEditModal('${u.telegram_id}')">📝 Изменить</button>
                <button class="success-btn" style="margin-top:5px; width:100%; background: #0088cc;" onclick="openTimeline('${u.telegram_id}')">📊 Досье</button>
                ${u.is_banned ?
                `<button class="success-btn" style="margin-top:5px; width:100%;" onclick="unbanUser('${u.telegram_id}')">✅ Разбан</button>` :
                `<button class="danger-btn" style="margin-top:5px; width:100%;" onclick="banUser('${u.telegram_id}')">🚫 Бан</button>`
            }
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Promo logic
async function loadPromos() {
    const promos = await safeFetchJson('/api/admin/promo', { headers: { 'x-admin-password': adminPassword } });
    if (!promos || promos._isError) return;

    const tbody = document.getElementById('promo-tbody');
    tbody.innerHTML = '';
    promos.forEach(p => {
        const reward = [];
        if (p.reward.balance) reward.push(`${p.reward.balance} PLN`);
        if (p.reward.lootboxes) {
            for (let k in p.reward.lootboxes) reward.push(`${p.reward.lootboxes[k]}x ${k}`);
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${p.code}</b></td>
            <td>${reward.join(', ')}</td>
            <td>${p.current_uses}</td>
            <td>${p.max_uses || '∞'}</td>
            <td>${p.expires_at ? new Date(p.expires_at).toLocaleDateString() : '---'}</td>
            <td><button class="danger-btn" onclick="deletePromo(${p.id})">🗑️</button></td>
        `;
        tbody.appendChild(tr);
    });
}

document.getElementById('promo-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const reward = {};
    const bal = document.getElementById('promo-balance').value;
    if (bal) reward.balance = parseFloat(bal);

    const lbs = {
        wooden: parseInt(document.getElementById('promo-lb-wooden').value) || 0,
        silver: parseInt(document.getElementById('promo-lb-silver').value) || 0,
        gold: parseInt(document.getElementById('promo-lb-gold').value) || 0,
        legendary: parseInt(document.getElementById('promo-lb-legendary').value) || 0
    };
    if (Object.values(lbs).some(v => v > 0)) reward.lootboxes = lbs;

    const body = {
        code: document.getElementById('promo-code').value,
        reward,
        maxUses: parseInt(document.getElementById('promo-max-uses').value) || 0,
        expiresAt: document.getElementById('promo-expiry').value
    };
    const data = await safeFetchJson('/api/admin/promo', {
        method: 'POST',
        headers: { 'x-admin-password': adminPassword, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (data && !data._isError) {
        alert('Промокод создан');
        e.target.reset();
        loadPromos();
    } else {
        alert('Ошибка: ' + (data?.error || 'Неизвестная ошибка'));
    }
});

async function deletePromo(id) {
    if (!confirm('Удалить промокод?')) return;
    await safeFetchJson(`/api/admin/promo/${id}`, { method: 'DELETE', headers: { 'x-admin-password': adminPassword } });
    loadPromos();
}

// Logs logic
async function loadLogs() {
    const logs = await safeFetchJson('/api/admin/logs', { headers: { 'x-admin-password': adminPassword } });
    if (!logs || logs._isError) return;
    const container = document.getElementById('logs-container');
    container.innerHTML = logs.map(l => `
        <div class="log-entry">
            <span class="time">[${new Date(l.timestamp).toLocaleString()}]</span>
            <span class="level" style="color: ${l.level === 'ERROR' ? '#ff4444' : l.level === 'WARNING' ? '#ffbb33' : '#44bbff'}">${l.level}</span>: ${l.message}
            ${l.stack ? `<pre style="font-size: 10px; color: #666; background: rgba(0,0,0,0.3); padding: 5px; margin-top: 5px;">${l.stack}</pre>` : ''}
        </div>
    `).join('') || 'Логов нет';
}

async function testLog() {
    try {
        const data = await safeFetchJson('/api/error-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: '🧪 TEST LOG FROM ADMIN',
                stack: 'Testing frontend -> server -> DB path',
                telegramId: 'ADMIN_TEST',
                screen: 'Admin Diagnostics'
            })
        });
        if (data && !data._isError) {
            alert('Тестовый лог отправлен! Сейчас список обновится.');
            setTimeout(loadLogs, 500);
        } else {
            alert('Ошибка при отправке теста');
        }
    } catch (e) { alert('Ошибка сети при тесте'); }
}
window.testLog = testLog;

async function clearLogs() {
    if (!confirm('Очистить все логи?')) return;
    await safeFetchJson('/api/admin/logs/clear', { method: 'POST', headers: { 'x-admin-password': adminPassword } });
    loadLogs();
}

let currentUserToEdit = null;

async function openEditModal(telegramId) {
    const users = await safeFetchJson('/api/admin/users', {
        headers: { 'x-admin-password': adminPassword }
    });
    if (!users || users._isError) return;
    const user = users.find(u => u.telegram_id === telegramId);

    if (!user) return;

    currentUserToEdit = telegramId;
    document.getElementById('edit-id').textContent = telegramId;
    document.getElementById('edit-balance').value = user.balance;
    document.getElementById('edit-level').value = user.level;
    document.getElementById('edit-exp').value = user.experience;
    document.getElementById('edit-fuel').value = user.fuel;
    document.getElementById('edit-stamina').value = user.stamina;

    document.getElementById('edit-lb-wooden').value = user.lootboxes?.wooden || 0;
    document.getElementById('edit-lb-silver').value = user.lootboxes?.silver || 0;
    document.getElementById('edit-lb-gold').value = user.lootboxes?.gold || 0;
    document.getElementById('edit-lb-legendary').value = user.lootboxes?.legendary || 0;

    // Load Fleet Info
    const fleetList = document.getElementById('edit-fleet-list');
    const totalEarnedSpan = document.getElementById('fleet-total-earned');
    const uncollectedSpan = document.getElementById('fleet-uncollected');

    if (fleetList) {
        fleetList.innerHTML = '<div class="loading">Загрузка флота...</div>';
        try {
            const fleetInfo = await safeFetchJson(`/api/admin/user/${telegramId}/fleet-info`, {
                headers: { 'x-admin-password': adminPassword }
            });

            if (fleetInfo && !fleetInfo._isError) {
                totalEarnedSpan.textContent = (fleetInfo.total_earned || 0).toFixed(2);
                uncollectedSpan.textContent = (fleetInfo.uncollected_profit || 0).toFixed(2);

                if (fleetInfo.cars && fleetInfo.cars.length > 0) {
                    fleetList.innerHTML = fleetInfo.cars.map(c => `
                        <div style="background:rgba(0,0,0,0.2); padding:8px; border-radius:6px; margin-bottom:5px; font-size:0.85em; border:1px solid rgba(255,255,255,0.05);">
                            <div style="display:flex; justify-content:space-between;">
                                <span>🚕 <b>${c.name}</b></span>
                                <span style="color:#2ecc71;">+${(c.earned || 0).toFixed(2)} PLN</span>
                            </div>
                            <div style="color:#888; font-size:0.9em;">
                                Водитель: ${c.driver_id ? `ID ${c.driver_id}` : '🚫 Нет'} | Состояние: ${c.condition}%
                            </div>
                        </div>
                    `).join('');
                } else {
                    fleetList.innerHTML = '<div style="opacity:0.5; text-align:center;">Нет машин во флоте</div>';
                }
            } else {
                fleetList.innerHTML = '<div style="color:#ff4444;">Ошибка загрузки</div>';
            }
        } catch (e) {
            fleetList.innerHTML = '<div style="color:#ff4444;">Ошибка сети</div>';
        }
    }

    document.getElementById('edit-modal').style.display = 'block';
}

function closeModal() {
    document.getElementById('edit-modal').style.display = 'none';
}

document.getElementById('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const updates = {
        balance: document.getElementById('edit-balance').value,
        level: document.getElementById('edit-level').value,
        experience: document.getElementById('edit-exp').value,
        fuel: document.getElementById('edit-fuel').value,
        stamina: document.getElementById('edit-stamina').value,
        lootboxes: {
            wooden: parseInt(document.getElementById('edit-lb-wooden').value),
            silver: parseInt(document.getElementById('edit-lb-silver').value),
            gold: parseInt(document.getElementById('edit-lb-gold').value),
            legendary: parseInt(document.getElementById('edit-lb-legendary').value)
        }
    };

    const response = await safeFetchJson('/api/admin/update-user', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-admin-password': adminPassword
        },
        body: JSON.stringify({ telegramId: currentUserToEdit, updates })
    });

    if (response && !response._isError) {
        alert('Данные обновлены');
        closeModal();
        loadUsers();
    } else {
        alert('Ошибка при обновлении: ' + (response?.error || 'Unknown'));
    }
});

async function resetUserProgress() {
    if (!currentUserToEdit) return;

    const confirm1 = confirm('⚠️ ВНИМАНИЕ! Это действие удалит ВЕСЬ прогресс игрока ' + currentUserToEdit + '.\n\nБаланс, уровень, машины и достижения будут сброшены к начальным.\n\nВы уверены?');
    if (!confirm1) return;

    const confirm2 = confirm('ПОСЛЕДНЕЕ ПРЕДУПРЕЖДЕНИЕ!\nРезультат необратим. Сбросить игрока?');
    if (!confirm2) return;

    try {
        const response = await safeFetchJson('/api/admin/reset-user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-password': adminPassword
            },
            body: JSON.stringify({ telegramId: currentUserToEdit })
        });

        if (response && !response._isError) {
            alert('🚀 Прогресс игрока успешно сброшен!');
            closeModal();
            loadUsers();
        } else {
            alert('Ошибка: ' + (response?.error || 'Не удалось сбросить прогресс'));
        }
    } catch (e) {
        console.error(e);
        alert('Ошибка сети или сервера');
    }
}

checkAuth();

// Announcement logic
async function loadAnnouncement() {
    const data = await safeFetchJson('/api/announcement');
    if (data && data.active) {
        document.getElementById('ann-title').value = data.data.title;
        document.getElementById('ann-message').value = data.data.message;
        document.getElementById('ann-type').value = data.data.type;
        updateAnnPreview();
    }
}

function updateAnnPreview() {
    const title = document.getElementById('ann-title').value || 'Заголовок по умолчанию';
    const message = document.getElementById('ann-message').value || 'Текст сообщения...';
    const type = document.getElementById('ann-type').value;

    const previewBox = document.getElementById('preview-box');
    document.getElementById('preview-title').textContent = title;
    document.getElementById('preview-message').textContent = message;

    const colors = {
        info: '#0088cc',
        success: '#34b545',
        warning: '#f39c12',
        error: '#e74c3c'
    };
    previewBox.style.borderLeftColor = colors[type];
}

['ann-title', 'ann-message', 'ann-type'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateAnnPreview);
});

document.getElementById('announcement-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
        title: document.getElementById('ann-title').value,
        message: document.getElementById('ann-message').value,
        type: document.getElementById('ann-type').value,
        active: true
    };

    const res = await fetch('/api/admin/announcement', {
        method: 'POST',
        headers: { 'x-admin-password': adminPassword, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (res.ok) alert('Объявление опубликовано!');
    else alert('Ошибка публикации');
});

async function clearAnnouncement() {
    if (!confirm('Удалить активное объявление?')) return;
    const res = await fetch('/api/admin/announcement', {
        method: 'POST',
        headers: { 'x-admin-password': adminPassword, 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false })
    });
    if (res.ok) {
        alert('Объявление удалено');
        document.getElementById('announcement-form').reset();
        updateAnnPreview();
    }
}

// ============= JACKPOT & FLEET MANAGEMENT =============

async function loadJackpotTab() {
    try {
        const data = await safeFetchJson('/api/admin/jackpot', { headers: { 'x-admin-password': adminPassword } });
        if (data && !data._isError) {
            const pool = data.pool || 0;
            document.getElementById('jackpot-pool').textContent = pool.toFixed(2) + ' PLN';

            const historyDiv = document.getElementById('jackpot-history');
            if (data.history && data.history.length > 0) {
                historyDiv.innerHTML = '<h4 style="color:#888; margin-bottom: 10px;">Последние выигрыши:</h4>' +
                    data.history.map(h => `
                        <div style="padding: 8px 12px; margin-bottom: 5px; background: rgba(255,255,255,0.05); border-radius: 8px; font-size: 13px;">
                            🏆 <b>${h.telegram_id}</b> — ${h.amount} PLN
                            <span style="opacity:0.5; float:right;">${new Date(h.won_at).toLocaleString()}</span>
                        </div>
                    `).join('');
            } else {
                historyDiv.innerHTML = '<p style="opacity:0.5; font-size:13px;">Выигрышей пока не было</p>';
            }
        }
    } catch (e) {
        console.error(e);
    }

    try {
        const cars = await safeFetchJson('/api/admin/cars', { headers: { 'x-admin-password': adminPassword } });
        if (cars && !cars._isError) {
            const select = document.getElementById('fleet-car-id');
            select.innerHTML = cars.map(c => `<option value="${c.id}">${c.name} (${c.purchase_price} PLN)</option>`).join('');
        }
    } catch (e) {
        console.error(e);
    }
}

async function forceJackpot() {
    const telegramId = document.getElementById('jackpot-user-id').value.trim();
    if (!telegramId) return alert('Введите Telegram ID!');
    if (!confirm(`Выдать весь джекпот пул игроку ${telegramId}?`)) return;

    try {
        const res = await fetch('/api/admin/force-jackpot', {
            method: 'POST',
            headers: { 'x-admin-password': adminPassword, 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId })
        });
        const data = await res.json();
        if (data.success) {
            alert(`🎰 ${data.message}`);
            loadJackpotTab();
        } else {
            alert('Ошибка: ' + (data.error || 'Unknown'));
        }
    } catch (e) {
        console.error(e);
        alert('Ошибка сети');
    }
}

async function setJackpotPool() {
    const amount = parseFloat(document.getElementById('jackpot-amount').value);
    if (isNaN(amount) || amount < 0) return alert('Введите корректную сумму!');

    try {
        const res = await fetch('/api/admin/set-jackpot', {
            method: 'POST',
            headers: { 'x-admin-password': adminPassword, 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount })
        });
        const data = await res.json();
        if (data.success) {
            alert(`Пул установлен: ${data.pool} PLN`);
            loadJackpotTab();
        } else {
            alert('Ошибка: ' + (data.error || 'Unknown'));
        }
    } catch (e) {
        console.error(e);
        alert('Ошибка сети');
    }
}

async function addFleetCar() {
    const telegramId = document.getElementById('fleet-user-id').value.trim();
    const carId = document.getElementById('fleet-car-id').value;
    const count = parseInt(document.getElementById('fleet-car-count').value) || 1;

    if (!telegramId) return alert('Введите Telegram ID!');
    if (!carId) return alert('Выберите машину!');

    try {
        for (let i = 0; i < count; i++) {
            const res = await fetch('/api/admin/add-fleet-car', {
                method: 'POST',
                headers: { 'x-admin-password': adminPassword, 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegramId, carId })
            });
            const data = await res.json();
            if (!data.success) {
                alert('Ошибка: ' + (data.error || 'Unknown'));
                return;
            }
        }
        alert(`✅ ${count}x машин добавлено в автопарк игрока ${telegramId}`);
    } catch (e) {
        console.error(e);
        alert('Ошибка сети');
    }
}

// ============= CONTAINER MANAGEMENT =============

async function loadContainersTab() {
    try {
        const cars = await safeFetchJson('/api/admin/cars', { headers: { 'x-admin-password': adminPassword } });
        if (!cars || cars._isError) return;

        const rewardSelect = document.getElementById('admin-container-reward');
        const currentVal = rewardSelect.value;
        rewardSelect.innerHTML = '<option value="">🎲 Случайное авто (Random)</option>' +
            cars.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        rewardSelect.value = currentVal;

        const data = await safeFetchJson('/api/admin/containers/config', { headers: { 'x-admin-password': adminPassword } });
        if (!data || data._isError) return;

        const config = data.config;
        const state = data.state;

        document.getElementById('admin-container-start-bid').value = config.startingBid;
        document.getElementById('admin-container-duration').value = config.duration / 60000;
        document.getElementById('admin-container-interval').value = config.interval / 60000;
        rewardSelect.value = config.manualReward || "";

        const statusInfo = document.getElementById('admin-container-status-info');
        statusInfo.innerHTML = `
            <div><b>Статус:</b> ${state.active ? '🟢 Идет аукцион' : '🟡 Ожидание'}</div>
            <div><b>Текущий приз:</b> ${state.reward ? state.reward.id : '---'}</div>
            <div><b>Текущая ставка:</b> ${state.currentBid} PLN</div>
            <div><b>Лидер:</b> ${state.highestBidder ? state.highestBidder.name + ' (' + state.highestBidder.telegramId + ')' : 'Нет'}</div>
            <br>
            <div><b>Награда в очереди:</b> ${config.manualReward || 'Random'}</div>
        `;
    } catch (e) {
        console.error('Error loading containers admin:', e);
    }
}

document.getElementById('container-admin-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const body = {
        startingBid: document.getElementById('admin-container-start-bid').value,
        duration: document.getElementById('admin-container-duration').value,
        interval: document.getElementById('admin-container-interval').value,
        manualReward: document.getElementById('admin-container-reward').value
    };

    try {
        const res = await fetch('/api/admin/containers/settings', {
            method: 'POST',
            headers: { 'x-admin-password': adminPassword, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            alert('Настройки аукциона сохранены! Применятся к следующему кругу.');
            loadContainersTab();
        } else {
            alert('Ошибка при сохранении настроек');
        }
    } catch (e) {
        console.error(e);
        alert('Ошибка сети');
    }
});

// Car Definitions
async function loadCarDefinitions() {
    const cars = await safeFetchJson('/api/admin/cars', { headers: { 'x-admin-password': adminPassword } });
    if (!cars || cars._isError) return;
    const tbody = document.getElementById('cars-tbody');
    tbody.innerHTML = '';

    cars.forEach(car => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${car.id}</td>
            <td>${car.image} ${car.name}</td>
            <td>${car.purchase_price}</td>
            <td>${car.fuel_consumption}</td>
            <td>${car.is_premium ? '🌟' : '🚕'}</td>
            <td>
                <button onclick="editCar('${car.id}')" class="edit-btn">Edit</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function editCar(id) {
    const res = await fetch('/api/admin/cars', { headers: { 'x-admin-password': adminPassword } });
    const cars = await res.json();
    const car = cars.find(c => c.id === id);
    if (!car) return;

    const newPrice = prompt(`Enter new purchase price for ${car.name}:`, car.purchase_price);
    if (newPrice !== null) {
        car.purchase_price = parseFloat(newPrice);
        const saveRes = await fetch(`/api/admin/cars/${id}`, {
            method: 'PUT',
            headers: { 'x-admin-password': adminPassword, 'Content-Type': 'application/json' },
            body: JSON.stringify(car)
        });
        if (saveRes.ok) loadCarDefinitions();
    }
}

// Settings
async function loadGlobalSettings() {
    const configs = await safeFetchJson('/api/admin/configs', { headers: { 'x-admin-password': adminPassword } });
    if (!configs || configs._isError) return;
    const list = document.getElementById('settings-list');
    list.innerHTML = '';

    configs.forEach(conf => {
        const div = document.createElement('div');
        div.className = 'stat-card';
        div.innerHTML = `
            <h3>${conf.key}</h3>
            <p id="conf-val-${conf.key}">${conf.value}</p>
            <button onclick="updateConfig('${conf.key}')">Update</button>
        `;
        list.appendChild(div);
    });
}

async function updateConfig(key) {
    const val = prompt(`Enter new value for ${key}:`);
    if (val === null) return;

    const result = await safeFetchJson('/api/admin/configs', {
        method: 'POST',
        headers: { 'x-admin-password': adminPassword, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: val })
    });
    if (result && !result._isError) loadGlobalSettings();
}

// Banning
async function banUser(tid) {
    if (!confirm(`Ban user ${tid}?`)) return;
    const result = await safeFetchJson(`/api/admin/user/${tid}/ban`, {
        method: 'POST',
        headers: { 'x-admin-password': adminPassword }
    });
    if (result && !result._isError) loadUsers();
}

async function unbanUser(tid) {
    const result = await safeFetchJson(`/api/admin/user/${tid}/unban`, {
        method: 'POST',
        headers: { 'x-admin-password': adminPassword }
    });
    if (result && !result._isError) loadUsers();
}

// ============= SUPPORT SYSTEM =============
let allSupportMessages = [];

async function loadSupportMessages() {
    try {
        const data = await safeFetchJson('/api/admin/support', { headers: { 'x-admin-password': adminPassword } });
        if (!data || data._isError) return;
        allSupportMessages = data;

        // Group messages by user_id to show only one row per player
        const userGroups = {};
        allSupportMessages.forEach(m => {
            if (!userGroups[m.user_id]) {
                userGroups[m.user_id] = m; // Since they are ordered by timestamp DESC, the first one is the latest
            }
        });

        const latestMessages = Object.values(userGroups);
        const tbody = document.getElementById('support-tbody');
        tbody.innerHTML = '';

        latestMessages.forEach(m => {
            let bubbleClass = 'bubble-user';
            let senderLabel = m.telegram_id || 'User';

            if (m.sender_type === 'admin') {
                bubbleClass = 'bubble-admin';
                senderLabel = 'Админ';
            } else if (m.sender_type === 'ai') {
                bubbleClass = 'bubble-ai';
                senderLabel = '🤖 ИИ';
            } else if (m.sender_type === 'system') {
                bubbleClass = 'bubble-system';
                senderLabel = '⚙️ Система';
            }

            const mediaHtml = m.file_id ?
                `<img src="/api/admin/support/media/${m.file_id}?admin_password=${adminPassword}" class="media-thumbnail" onclick="showFullImage(this.src)">` :
                '---';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(m.timestamp).toLocaleString()}</td>
                <td><b>${m.telegram_id || 'User'}</b><br><small>${m.user_id}</small></td>
                <td>
                    <div class="chat-bubble ${bubbleClass}" style="max-width: 100%; cursor: pointer;" onclick="openSupportModal('${m.telegram_id}', '${m.user_id}')">
                        <small style="opacity:0.7;">Последнее (${senderLabel}):</small><br>
                        ${m.message || ''}
                    </div>
                </td>
                <td>${mediaHtml}</td>
                <td>
                    <button onclick="openSupportModal('${m.telegram_id}', '${m.user_id}')">💬 Показать чат</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('Error loading support messages:', e);
    }
}

function showFullImage(src) {
    const modal = document.getElementById('image-viewer-modal');
    const img = document.getElementById('full-image-display');
    img.src = src;
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
}

function closeImageViewer() {
    document.getElementById('image-viewer-modal').style.display = 'none';
}

function openSupportModal(telegramId, userId) {
    document.getElementById('support-user-display').textContent = telegramId;
    document.getElementById('support-telegram-id').value = telegramId;
    document.getElementById('support-reply-text').value = '';

    // Load history for this user
    const historyDiv = document.getElementById('support-chat-history');
    const userHistory = allSupportMessages
        .filter(m => m.user_id === userId)
        .reverse(); // Show chronological order (oldest first in chat)

    if (userHistory.length === 0) {
        historyDiv.innerHTML = '<p style="text-align:center; opacity:0.5;">История пуста</p>';
    } else {
        historyDiv.innerHTML = userHistory.map(m => {
            let bubbleClass = 'bubble-user';
            if (m.sender_type === 'admin') bubbleClass = 'bubble-admin';
            else if (m.sender_type === 'ai') bubbleClass = 'bubble-ai';
            else if (m.sender_type === 'system') bubbleClass = 'bubble-system';

            const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `
                <div class="chat-time">${time}</div>
                <div class="chat-bubble ${bubbleClass}">${m.message || ''}</div>
            `;
        }).join('');
    }

    document.getElementById('support-modal').style.display = 'block';

    // Auto-scroll history
    setTimeout(() => {
        historyDiv.scrollTop = historyDiv.scrollHeight;
    }, 100);
}

// Вспомогательные функции для модалок
function closeModal() {
    document.getElementById('edit-modal').style.display = 'none';
}

function closeSupportModal() {
    document.getElementById('support-modal').style.display = 'none';
}

// Close modals on background click
window.onclick = function (event) {
    const editModal = document.getElementById('edit-modal');
    const supportModal = document.getElementById('support-modal');
    const imageModal = document.getElementById('image-viewer-modal');
    if (event.target == editModal) closeModal();
    if (event.target == supportModal) closeSupportModal();
    if (event.target == imageModal) closeImageViewer();
}

document.getElementById('support-reply-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const telegramId = document.getElementById('support-telegram-id').value;
    const text = document.getElementById('support-reply-text').value;

    try {
        const result = await safeFetchJson('/api/admin/support/reply', {
            method: 'POST',
            headers: {
                'x-admin-password': adminPassword,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ telegramId, text })
        });

        if (result && !result._isError) {
            alert('Ответ отправлен!');
            closeSupportModal();
            loadSupportMessages();
        } else {
            alert('Ошибка: ' + (result?.message || result?.error || 'Unknown'));
        }
    } catch (e) {
        console.error('Reply error:', e);
        alert('Ошибка при отправке');
    }
});
async function saveOnlineOffset() {
    const val = document.getElementById('online-offset-input').value;
    try {
        const result = await safeFetchJson('/api/admin/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
            body: JSON.stringify({ key: 'online_offset', value: val })
        });
        if (result && !result._isError) alert('Смещение онлайна сохранено');
        else alert('Ошибка сохранения: ' + (result?.error || 'Unknown'));
    } catch (e) {
        alert('Ошибка сети');
    }
}

async function loadAdminPlates() {
    try {
        const data = await safeFetchJson('/api/admin/plates', {
            headers: { 'x-admin-password': adminPassword }
        });
        if (!data || data._isError) return;
        const plates = data;
        const tbody = document.getElementById('plates-tbody');
        tbody.innerHTML = '';

        if (!Array.isArray(plates)) {
            console.error('Invalid plates data received:', plates);
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ff4d4d;">Ошибка загрузки данных</td></tr>';
            return;
        }

        plates.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="license-plate ${p.rarity?.toLowerCase() || 'standard'}">${p.plate_number}</span></td>
                <td>${p.owner_name ? `<b>${p.owner_name}</b> (<code style="font-size:0.8em;">${p.owner_id}</code>)` : '---'}</td>
                <td>${p.rarity || 'Common'}</td>
                <td>${p.is_equipped ? '✅ Экипирован' : '📦 В запасе'}</td>
                <td>${p.market_price ? `💰 ${p.market_price} PLN` : '---'}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error loading admin plates:', error);
    }
}

async function refundAllPlates() {
    if (!confirm('🚨 ВНИМАНИЕ! Это действие ВЕРНЕТ ДЕНЬГИ всем владельцам номеров и СНИМЕТ их с машин. Продолжить?')) return;
    try {
        const res = await safeFetchJson('/api/admin/plates/refund-all', {
            method: 'POST',
            headers: { 'x-admin-password': adminPassword }
        });
        if (res.success) {
            alert(`Успех! Возвращено средств за ${res.count} номеров на сумму ${res.total_refunded.toFixed(2)} PLN.`);
            loadAdminPlates();
        }
    } catch (e) { alert('Ошибка'); }
}

async function exportDB() {
    if (!confirm('Вы уверены, что хотите скачать файл базы данных?')) return;

    try {
        const response = await fetch('/api/admin/db/export', {
            headers: { 'x-admin-password': adminPassword }
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `taxi_backup_${new Date().toISOString().split('T')[0]}.db`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } else {
            const error = await response.json();
            alert(`Ошибка экспорта: ${error.error}`);
        }
    } catch (e) {
        console.error(e);
        alert('Ошибка при скачивании базы данных');
    }
}

async function emergencyResetUser(inputId = 'emergency-target-id') {
    const targetIdInput = document.getElementById(inputId);
    const targetId = targetIdInput.value.trim();
    if (!targetId) return alert('Введите ID взломщика');

    if (!confirm(`⚠️ ВНИМАНИЕ! Вы собираетесь применить санкции к игроку ${targetId}.\n\n- Баланс будет обнулен\n- Все АЗС будут изъяты\n- Игрок будет ЗАБАНЕН\n\nВы уверены?`)) {
        return;
    }

    try {
        const result = await safeFetchJson('/api/admin/emergency/reset-user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-password': adminPassword
            },
            body: JSON.stringify({ targetId })
        });

        if (result && !result._isError) {
            alert('✅ ' + (result.message || 'Action completed'));
            targetIdInput.value = '';
            if (typeof loadUsers === 'function') loadUsers();
            if (typeof loadActivities === 'function') loadActivities();
        } else {
            alert('❌ Ошибка: ' + (result?.error || 'Неизвестная ошибка'));
        }
    } catch (e) {
        console.error(e);
        alert('Ошибка при выполнении экстренного сброса');
    }
}

// ============= v5.0: Advanced Economy Tools =============

async function loadConfigs() {
    const tbody = document.getElementById('config-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3">Загрузка...</td></tr>';

    const configs = await safeFetchJson('/api/admin/configs', { headers: { 'x-admin-password': adminPassword } });
    if (!configs || configs._isError) {
        tbody.innerHTML = '<tr><td colspan="3">Ошибка загрузки</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    configs.forEach(cfg => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <b>${cfg.key}</b><br>
                <small style="color:#aaa;">${cfg.description || cfg.category || ''}</small>
            </td>
            <td><input type="text" id="cfg-${cfg.key}" value="${cfg.value}" style="width: 80px;"></td>
            <td><button onclick="updateConfig('${cfg.key}')" class="btn-small">💾</button></td>
        `;
        tbody.appendChild(tr);
    });

    // Also update jackpot pool display
    const jackpotData = await safeFetchJson('/api/admin/stats', { headers: { 'x-admin-password': adminPassword } });
    if (jackpotData && jackpotData.jackpot) {
        const poolEl = document.getElementById('jackpot-current-pool');
        if (poolEl) poolEl.textContent = jackpotData.jackpot.toFixed(2) + ' PLN';
    }
}

async function updateConfig(key) {
    const value = document.getElementById(`cfg-${key}`).value;
    const res = await safeFetchJson('/api/admin/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ key, value })
    });

    if (res && !res._isError) {
        alert('Параметр обновлен!');
        loadConfigs();
    } else {
        alert('Ошибка обновления');
    }
}

async function adjustJackpot() {
    const amount = document.getElementById('jackpot-adjust-amount').value;
    if (!amount) return alert('Введите сумму');

    const res = await safeFetchJson('/api/admin/jackpot/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ amount })
    });

    if (res && res.success) {
        alert('Джекпот обновлен!');
        loadConfigs();
    } else {
        alert('Ошибка обновления джекпота');
    }
}

async function runAIScan() {
    const btn = document.querySelector('button[onclick="runAIScan()"]');
    const text = document.getElementById('ai-report-text');

    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = '⏳ Анализирую...';
    text.textContent = 'Связываюсь с Gemini AI для аудита экономики...';

    const res = await safeFetchJson('/api/admin/ai/scan', {
        method: 'POST',
        headers: { 'x-admin-password': adminPassword }
    });

    btn.disabled = false;
    btn.textContent = oldText;

    if (res && res.report) {
        text.innerHTML = res.report.replace(/\n/g, '<br>');
    } else {
        text.textContent = 'Ошибка AI-сканирования.';
    }
}

// ============= v5.0: User Timeline (Deep Dossier) =============

async function openTimeline(telegramId) {
    document.getElementById('timeline-modal').style.display = 'block';
    document.getElementById('timeline-tid').textContent = telegramId;
    const actList = document.getElementById('timeline-activity-list');
    actList.innerHTML = '<div class="loading-spinner">📡 Подключаюсь к базе данных...</div>';

    const res = await safeFetchJson(`/api/admin/users/${telegramId}/timeline`, {
        headers: { 'x-admin-password': adminPassword }
    });

    if (!res || res._isError) {
        actList.innerHTML = '<div class="danger-text">❌ Ошибка загрузки данных</div>';
        return;
    }

    document.getElementById('timeline-balance').textContent = res.user.balance.toFixed(2);
    document.getElementById('timeline-reg-date').textContent = res.user.created_at ? new Date(res.user.created_at).toLocaleDateString() : 'Неизвестно';
    document.getElementById('timeline-rides').textContent = res.user.rides_total || 0;

    actList.innerHTML = '';
    res.history.forEach(a => {
        const item = document.createElement('div');
        item.className = 'activity-item';

        // Parse details if it's JSON
        let detailHtml = '';
        try {
            const details = typeof a.details === 'string' ? JSON.parse(a.details) : a.details;
            if (details) {
                Object.entries(details).forEach(([k, v]) => {
                    let cls = 'detail-badge';
                    if (k === 'earned' || k === 'won' || k === 'amount') cls += ' money';
                    if (k === 'reason' || k === 'error') cls += ' danger';
                    detailHtml += `<span class="${cls}">${k}: ${v}</span>`;
                });
            }
        } catch (e) { detailHtml = `<span class="detail-badge">${a.details}</span>`; }

        item.innerHTML = `
            <span class="a-time">${new Date(a.timestamp).toLocaleString()}</span>
            <span class="a-action">${a.action}</span>
            <div class="activity-details">${detailHtml}</div>
        `;
        actList.appendChild(item);
    });

    renderUserWealthChart(res.wealthHistory);
}

function closeTimeline() {
    document.getElementById('timeline-modal').style.display = 'none';
}

function renderUserWealthChart(history) {
    const canvas = document.getElementById('userWealthChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (charts['userWealth']) charts['userWealth'].destroy();

    let currentBalance = 0;
    const data = history.map(h => {
        currentBalance += h.price;
        return { x: new Date(h.completed_at), y: currentBalance };
    }).reverse(); // Most recent last for the chart

    charts['userWealth'] = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Накопленный доход (PLN)',
                data: data,
                borderColor: '#0088cc',
                backgroundColor: 'rgba(0, 136, 204, 0.1)',
                fill: true,
                pointRadius: 4,
                pointBackgroundColor: '#fff',
                pointBorderWidth: 2,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'day' },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { callback: value => value + ' PLN' }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    padding: 10
                }
            }
        }
    });
}

async function loadCarProfitability() {
    const tbody = document.getElementById('profitability-tbody');
    tbody.innerHTML = '<tr><td colspan="4">Загрузка данных...</td></tr>';

    const data = await safeFetchJson('/api/admin/car-profitability', {
        headers: { 'x-admin-password': adminPassword }
    });

    if (data && !data._isError) {
        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4">Нет данных о поездках</td></tr>';
            return;
        }

        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${item.name}</b> <br><small style="color:#666">${item.modelId}</small></td>
                <td>${item.totalRides}</td>
                <td><span style="color:#2ecc71; font-weight:bold;">${item.totalRevenue.toFixed(2)} PLN</span></td>
                <td><span style="color:var(--accent-color);">${item.efficiency.toFixed(2)} PLN</span></td>
            `;
            tbody.appendChild(tr);
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="4" style="color:#e74c3c;">Ошибка загрузки данных</td></tr>';
    }
}
// ============= EVENT MANAGEMENT =============

async function loadEventsAdmin() {
    const list = document.getElementById('events-list');
    if (!list) return;

    list.innerHTML = '<div class="loading">Загрузка событий...</div>';

    try {
        const events = await safeFetchJson('/api/admin/events', {
            headers: { 'x-admin-password': adminPassword }
        });

        if (events && !events._isError) {
            list.innerHTML = events.map(ev => `
                <div class="event-admin-card ${ev.is_active ? 'active' : ''}">
                    <div class="event-info">
                        <h3>${ev.name}</h3>
                        <p>${ev.description}</p>
                    </div>
                    <div class="event-controls">
                        <input type="number" id="multiplier-${ev.id}" value="${ev.multiplier}" step="0.1" min="1" max="20" style="width: 60px; margin-right: 10px; padding: 4px; border-radius: 4px; border: 1px solid #555; background: #333; color: white;">
                        <button class="btn btn-primary" style="padding: 4px 8px; margin-right: 15px;" onclick="updateEventMultiplier('${ev.id}')">💾</button>
                        <label class="switch">
                            <input type="checkbox" ${ev.is_active ? 'checked' : ''} 
                                   onchange="toggleEvent('${ev.id}', this.checked)">
                            <span class="slider round"></span>
                        </label>
                    </div>
                </div>
            `).join('');
        } else {
            list.innerHTML = '<div class="error">Ошибка загрузки событий</div>';
        }
    } catch (e) {
        console.error(e);
        list.innerHTML = '<div class="error">Ошибка сети</div>';
    }
}

async function toggleEvent(eventId, active) {
    try {
        const res = await safeFetchJson('/api/admin/events/toggle', {
            method: 'POST',
            headers: { 'x-admin-password': adminPassword, 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId, active })
        });

        if (res && res.success) {
            loadEventsAdmin(); // Refresh list to update active state
        } else {
            alert('Ошибка: ' + (res?.error || 'Не удалось переключить событие'));
            loadEventsAdmin(); // Restore state locally
        }
    } catch (e) {
        alert('Ошибка сети');
        loadEventsAdmin();
    }
}

async function updateEventMultiplier(eventId) {
    const el = document.getElementById(`multiplier-${eventId}`);
    if (!el) return;
    const multiplier = parseFloat(el.value);

    try {
        const res = await safeFetchJson('/api/admin/events/multiplier', {
            method: 'POST',
            headers: { 'x-admin-password': adminPassword, 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId, multiplier })
        });

        if (res && res.success) {
            loadEventsAdmin();
            alert('Множитель обновлён!');
        } else {
            alert('Ошибка: ' + (res?.error || 'Не удалось обновить'));
        }
    } catch (e) {
        alert('Ошибка сети');
    }
}
// ============= CRYPTO MANAGEMENT =============

async function loadCryptoAdmin() {
    try {
        const stats = await safeFetchJson('/api/admin/crypto/stats', {
            headers: { 'x-admin-password': adminPassword }
        });

        if (stats && !stats._isError && stats.currentPrice !== undefined) {
            document.getElementById('admin-crypto-price').textContent = `${parseFloat(stats.currentPrice).toFixed(4)} PLN`;
            document.getElementById('admin-crypto-total-supply').textContent = `${parseFloat(stats.totalSupply || 0).toFixed(2)} $TAXI`;
        }

        const settings = await safeFetchJson('/api/admin/crypto/settings', {
            headers: { 'x-admin-password': adminPassword }
        });

        if (settings && !settings._isError) {
            const minInput = document.getElementById('crypto-min-price');
            const maxInput = document.getElementById('crypto-max-price');
            if (minInput) minInput.value = settings.minFluctuation;
            if (maxInput) maxInput.value = settings.maxFluctuation;
        }

        const holders = await safeFetchJson('/api/admin/crypto/holders', {
            headers: { 'x-admin-password': adminPassword }
        });

        const tbody = document.getElementById('crypto-holders-tbody');
        if (holders && !holders._isError && Array.isArray(holders)) {
            tbody.innerHTML = holders.map(h => `
                <tr>
                    <td><b>${h.username || 'Игрок'}</b><br><small style="color:#888">${h.telegram_id}</small></td>
                    <td style="color:#f1c40f; font-weight:bold;">${parseFloat(h.crypto_taxi_balance || 0).toFixed(2)} $TAXI</td>
                    <td>${(parseFloat(h.crypto_taxi_balance || 0) * (stats?.currentPrice || 0)).toFixed(2)} PLN</td>
                </tr>
            `).join('');
        }
    } catch (e) {
        console.error('Error in loadCryptoAdmin:', e);
    }
}

async function saveCryptoSettings() {
    const minFluctuation = parseFloat(document.getElementById('crypto-min-price').value);
    const maxFluctuation = parseFloat(document.getElementById('crypto-max-price').value);

    try {
        const res = await safeFetchJson('/api/admin/crypto/settings', {
            method: 'POST',
            headers: { 'x-admin-password': adminPassword, 'Content-Type': 'application/json' },
            body: JSON.stringify({ minFluctuation, maxFluctuation })
        });

        if (res && res.success) {
            alert('Настройки крипто-рынка сохранены!');
            loadCryptoAdmin();
        } else {
            alert('Ошибка: ' + (res?.error || 'Не удалось сохранить'));
        }
    } catch (e) { alert('Ошибка сети'); }
}

// === Вкладка: Акции (Фондовый рынок) ===

async function loadStocksAdmin() {
    try {
        const stocks = await safeFetchJson('/api/stocks', {
            headers: { 'x-admin-password': adminPassword }
        });

        const tbody = document.getElementById('admin-stocks-tbody');
        const selectBox = document.getElementById('admin-stock-ticker');

        if (stocks && !stocks._isError && Array.isArray(stocks)) {
            // Populate the table
            tbody.innerHTML = stocks.map(s => {
                const diff = s.price - s.previous_price;
                const color = diff >= 0 ? '#2ecc71' : '#e74c3c';
                return `
                <tr>
                    <td><b>${s.symbol}</b></td>
                    <td>${s.name}</td>
                    <td style="color:${color}; font-weight:bold;">${s.price.toFixed(2)}</td>
                    <td style="color:#aaa;">${s.previous_price.toFixed(2)}</td>
                </tr>
                `;
            }).join('');

            // Dynamically populate the select dropdown
            if (selectBox) {
                const currentValue = selectBox.value; // Store current selection
                selectBox.innerHTML = stocks.map(s => `<option value="${s.symbol}">${s.name} (${s.symbol})</option>`).join('');
                if (currentValue && stocks.some(s => s.symbol === currentValue)) {
                    selectBox.value = currentValue; // Restore selection if it still exists
                }
            }
        }
    } catch (e) {
        console.error('Error loadStocksAdmin:', e);
    }
}

async function setAdminStockPrice() {
    const symbol = document.getElementById('admin-stock-ticker').value;
    const priceInput = document.getElementById('admin-stock-price-input').value;
    const newPrice = parseFloat(priceInput);

    if (!symbol || isNaN(newPrice) || newPrice <= 0) {
        alert('Пожалуйста, введите корректную цену (больше 0).');
        return;
    }

    if (!confirm(`Вы уверены, что хотите установить цену ${symbol} на ${newPrice} PLN? Это резко изменит портфели игроков!`)) return;

    try {
        const res = await safeFetchJson('/api/admin/stocks/set-price', {
            method: 'POST',
            headers: { 'x-admin-password': adminPassword, 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: symbol, new_price: newPrice })
        });

        if (res && res.success) {
            alert(res.message || `Цена ${symbol} успешно изменена!`);
            document.getElementById('admin-stock-price-input').value = '';
            loadStocksAdmin(); // Refresh the table
        } else {
            alert('Ошибка: ' + (res?.error || 'Не удалось изменить цену'));
        }
    } catch (e) {
        alert('Ошибка сети');
    }
}
