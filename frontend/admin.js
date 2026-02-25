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
                if (!confirm('Вы уверены, что хотите отправить это сообщение ВСЕМ пользователям?')) return;

                try {
                    const data = await safeFetchJson(`/api/admin/broadcast`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
                        body: JSON.stringify({ message: msg })
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
    table.innerHTML = '<tr><td colspan="8">Загрузка...</td></tr>';

    try {
        const stations = await safeFetchJson('/api/admin/gas-stations', {
            headers: { 'x-admin-password': adminPassword }
        });
        if (!stations || stations._isError) return;

        table.innerHTML = '';
        stations.forEach(s => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${s.id}</td>
                <td>${s.name}</td>
                <td>${s.owner_name ? `<b>${s.owner_name}</b> (${s.owner_id})` : '<i style="color:#888;">Нет владельца</i>'}</td>
                <td>${s.fuel_stock.toFixed(1)}</td>
                <td>${s.uncollected_revenue.toFixed(2)}</td>
                <td>${s.revenue_total.toFixed(2)}</td>
                <td>${s.price_petrol} / ${s.price_gas}</td>
                <td>
                    ${s.owner_id ? `<button onclick="takeAwayStation(${s.id})" class="danger-btn" style="padding:4px 8px; font-size:0.8em;">Забрать</button>` : ''}
                    <button onclick="giveStationStock(${s.id})" class="edit-btn" style="padding:4px 8px; font-size:0.8em;">+ Топливо</button>
                </td>
            `;
            table.appendChild(tr);
        });
    } catch (e) {
        console.error(e);
        table.innerHTML = '<tr><td colspan="8">Ошибка загрузки</td></tr>';
    }
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
    const res = await fetch('/api/admin/analytics', { headers: { 'x-admin-password': adminPassword } });
    const data = await res.json();

    initChart('regChart', 'Регистрации', data.registrations, '#0088cc');
    initChart('ridesChart', 'Поездки', data.rides, '#34b545');

    // Retention / Active Users
    const statsRet = document.getElementById('stats-retention');
    if (statsRet) statsRet.textContent = `${data.dau} / ${data.wau}`;

    // District chart
    if (data.districtPopularity) {
        initBarChart('districtChart', 'Заказы по районам', data.districtPopularity);
    }
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
    const activities = await safeFetchJson('/api/admin/activities', { headers: { 'x-admin-password': adminPassword } });
    if (!activities || activities._isError) return;

    const tbody = document.getElementById('activities-tbody');
    tbody.innerHTML = '';
    activities.forEach(a => {
        const tr = document.createElement('tr');
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
                <td>${p.owner_name || '---'} (${p.owner_id})</td>
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
