// ============= v2.4: CASINO & LOOTBOX LOGIC =============

// Casino functions
async function playSlots(bet) {
    try {
        soundManager.play('button');

        const response = await fetch(`${API_BASE_URL}/casino/slots`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: TELEGRAM_ID, bet })
        });

        if (!response.ok) {
            const error = await response.json();
            showNotification(error.error || 'Ошибка', 'error');
            return;
        }

        const data = await response.json();

        // Animate reels
        document.getElementById('reel1').textContent = data.result.reels[0];
        document.getElementById('reel2').textContent = data.result.reels[1];
        document.getElementById('reel3').textContent = data.result.reels[2];

        document.getElementById('slot-result').textContent = data.result.message;

        if (data.result.winAmount > 0) {
            soundManager.play('coin');
        }

        userData.balance = data.balance;
        userData.casino_spins_today = 10 - data.spins_left;

        updateCasinoUI();
        showNotification(data.result.message, data.result.winAmount > bet ? 'success' : 'warning');

    } catch (error) {
        console.error('Error playing slots:', error);
        showNotification('Ошибка сервера', 'error', error);
    }
}

async function playRoulette() {
    try {
        const betInput = document.getElementById('roulette-custom-bet');
        let bet = betInput && betInput.value ? parseInt(betInput.value) : 100;

        if (isNaN(bet) || bet < 10) {
            showNotification('Минимальная ставка 10 PLN', 'error');
            return;
        }

        soundManager.play('button');

        const response = await fetch(`${API_BASE_URL}/casino/roulette`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: TELEGRAM_ID, bet })
        });

        if (!response.ok) {
            const error = await response.json();
            showNotification(error.error || 'Ошибка', 'error');
            return;
        }

        const data = await response.json();

        // Animate wheel
        const wheel = document.querySelector('.roulette-sectors');
        wheel.classList.add('spinning');

        setTimeout(() => {
            wheel.classList.remove('spinning');
            document.getElementById('roulette-result').textContent = data.result.message;

            if (data.result.winAmount > 0) {
                soundManager.play('coin');
            }

            userData.balance = data.balance;
            userData.casino_spins_today = 10 - data.spins_left;

            updateCasinoUI();
            showNotification(data.result.message, data.result.winAmount > bet ? 'success' : 'warning');
        }, 3000);

    } catch (error) {
        console.error('Error playing roulette:', error);
        showNotification('Ошибка сервера', 'error', error);
    }
}

function updateCasinoUI() {
    document.getElementById('casino-balance').textContent = userData.balance.toFixed(2);
    document.getElementById('casino-spins').textContent = userData.casino_spins_today || 0;

    const spinsLeft = 10 - (userData.casino_spins_today || 0);
    const betButtons = document.querySelectorAll('.bet-btn');
    const rouletteBtn = document.getElementById('spin-roulette-btn');
    const crashStartBtn = document.getElementById('crash-start-btn');

    betButtons.forEach(btn => {
        btn.disabled = spinsLeft <= 0 || userData.balance < parseInt(btn.dataset.bet);
    });

    if (rouletteBtn) {
        rouletteBtn.disabled = spinsLeft <= 0 || userData.balance < 10;
    }

    if (crashStartBtn) {
        crashStartBtn.disabled = spinsLeft <= 0 || userData.balance < 10;
    }
}

// Crash Game Logic
// Crash Game Logic
let crashState = {
    active: false,
    multiplier: 1.0,
    startTime: 0,
    animationId: null,
    canvas: null,
    ctx: null
};

let crashPollInterval = null;

async function startCrash() {
    const betInput = document.getElementById('crash-bet');
    const bet = parseInt(betInput.value);

    if (isNaN(bet) || bet < 10) {
        showNotification('Минимальная ставка 10 PLN', 'error');
        return;
    }

    if (userData.balance < bet) {
        showNotification('Недостаточно баланса', 'error');
        return;
    }

    try {
        soundManager.play('button');
        const response = await fetch(`${API_BASE_URL}/casino/crash/bet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: TELEGRAM_ID, bet })
        });

        const data = await response.json();
        if (!response.ok) {
            showNotification(data.error || 'Ошибка ставки', 'error');
            return;
        }

        userData.balance = data.balance;
        updateCasinoUI();
        updateMainScreen();

        showNotification('✅ Ставка принята!', 'success');
        document.getElementById('crash-start-btn').disabled = true;
    } catch (e) {
        console.error('Crash bet error:', e);
        showNotification('Ошибка соединения', 'error', e);
    }
}

async function updateCrashStatus() {
    if (screens.casino.style.display === 'none') {
        if (crashPollInterval) {
            clearInterval(crashPollInterval);
            crashPollInterval = null;
        }
        return;
    }

    try {
        const res = await fetch(`${API_BASE_URL}/casino/crash/status`);
        const data = await res.json();

        const multiplierEl = document.getElementById('crash-multiplier');
        const startBtn = document.getElementById('crash-start-btn');
        const cashoutBtn = document.getElementById('crash-cashout-btn');
        const resultEl = document.getElementById('crash-result');

        if (data.phase === 'betting') {
            multiplierEl.textContent = `x1.00`;
            multiplierEl.classList.remove('crashed');
            startBtn.style.display = 'block';
            startBtn.disabled = !data.bettingOpen || userData.balance < 10;
            cashoutBtn.style.display = 'none';
            resultEl.textContent = `Ожидание полета... ${Math.ceil(data.timeLeft / 1000)}с`;

            if (crashState.active) {
                crashState.active = false;
                cancelAnimationFrame(crashState.animationId);
                document.getElementById('crash-car').classList.remove('crash-crashing');
            }
        }
        else if (data.phase === 'flying') {
            startBtn.style.display = 'none';
            cashoutBtn.style.display = 'block';

            if (!crashState.active) {
                crashState.active = true;
                crashState.startTime = Date.now() - (data.multiplier > 1 ? Math.log(data.multiplier) / 0.05 * 1000 : 0);
                document.getElementById('crash-car').classList.add('crash-crashing');
                initCrashCanvas();
                animateCrash();
            }
            if (Math.abs(crashState.multiplier - data.multiplier) > 0.5) {
                crashState.multiplier = data.multiplier;
            }
        }
        else if (data.phase === 'crashed') {
            if (crashState.active) {
                handleCrash(data.multiplier);
            }
            startBtn.style.display = 'block';
            startBtn.disabled = true;
            cashoutBtn.style.display = 'none';
            resultEl.innerHTML = `<span style="color: var(--danger-color)">💥 КРАШ! x${data.multiplier.toFixed(2)}</span>`;
        }

        const historyEl = document.getElementById('crash-history');
        if (historyEl && data.history) {
            historyEl.innerHTML = data.history.map(h =>
                `<span class="history-item ${h.crashPoint >= 2 ? 'high' : 'low'}">x${h.crashPoint.toFixed(2)}</span>`
            ).join('');
        }
    } catch (e) {
        console.warn('Crash poll error:', e);
    }
}

function initCrashCanvas() {
    const canvas = document.getElementById('crash-canvas');
    if (!canvas) return;
    crashState.canvas = canvas;
    crashState.ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
}

function animateCrash() {
    if (!crashState.active) return;

    const elapsed = (Date.now() - crashState.startTime) / 1000;
    crashState.multiplier = Math.max(1, Math.pow(Math.E, 0.05 * elapsed));

    document.getElementById('crash-multiplier').textContent = `x${crashState.multiplier.toFixed(2)}`;
    const betVal = parseInt(document.getElementById('crash-bet').value) || 0;
    document.getElementById('cashout-value').textContent = Math.floor(betVal * crashState.multiplier);

    const ctx = crashState.ctx;
    if (!ctx) return;
    const w = crashState.canvas.width;
    const h = crashState.canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.strokeStyle = '#0088cc';
    ctx.lineWidth = 3;
    ctx.moveTo(0, h);

    for (let x = 0; x < w; x++) {
        const tx = (x / w) * elapsed;
        const ty = Math.pow(Math.E, 0.05 * tx);
        const y = h - (ty - 1) * (h / 5);
        ctx.lineTo(x, y);
        if (x >= w - 1) {
            const car = document.getElementById('crash-car');
            car.style.left = `${x - 20}px`;
            car.style.bottom = `${h - y + 10}px`;
            car.style.transform = `rotate(-${Math.min(45, (ty - 1) * 10)}deg)`;
        }
    }
    ctx.stroke();

    crashState.animationId = requestAnimationFrame(animateCrash);
}

async function cashoutCrash() {
    if (!crashState.active) return;

    crashState.active = false;
    cancelAnimationFrame(crashState.animationId);

    try {
        const response = await fetch(`${API_BASE_URL}/casino/crash/cashout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: TELEGRAM_ID })
        });

        const data = await response.json();

        if (data.success) {
            userData.balance = data.balance;
            updateCasinoUI();
            updateMainScreen();
            document.getElementById('crash-result').innerHTML = `<span style="color: var(--success-color)">Успех! x${data.multiplier} (+${data.winAmount} PLN)</span>`;
            soundManager.play('coin');
        } else {
            handleCrash(data.multiplier || crashState.multiplier);
        }
    } catch (e) {
        console.error('Cashout error:', e);
        showNotification('Ошибка вывода', 'error', e);
    }
}

function handleCrash(crashPoint) {
    crashState.active = false;
    cancelAnimationFrame(crashState.animationId);

    document.getElementById('crash-multiplier').textContent = `x${crashPoint.toFixed(2)}`;
    document.getElementById('crash-multiplier').classList.add('crashed');
    document.getElementById('crash-car').classList.remove('crash-crashing');
    document.getElementById('crash-result').innerHTML = `<span style="color: var(--danger-color)">💥 КРАШ! x${crashPoint.toFixed(2)}</span>`;

    try { soundManager.play('collision'); } catch (e) { }
}

// Lootbox functions
async function loadLootboxes() {
    try {
        const response = await fetch(`${API_BASE_URL}/lootbox/${TELEGRAM_ID}`);
        if (!response.ok) throw new Error('Failed to load lootboxes');

        const data = await response.json();

        userData.lootboxes = data.lootboxes;

        // Update counts
        document.getElementById('wooden-count').textContent = data.lootboxes.wooden || 0;
        document.getElementById('silver-count').textContent = data.lootboxes.silver || 0;
        document.getElementById('gold-count').textContent = data.lootboxes.gold || 0;
        document.getElementById('legendary-count').textContent = data.lootboxes.legendary || 0;

        // Update buttons
        document.querySelectorAll('.open-lootbox-btn').forEach(btn => {
            const type = btn.dataset.type;
            btn.disabled = !data.lootboxes[type] || data.lootboxes[type] <= 0;
        });

        // Show notification for new boxes
        if (data.newBoxes && data.newBoxes.length > 0) {
            data.newBoxes.forEach(box => {
                showNotification(`🎁 Получен сундук: ${box.type} x${box.count}`, 'success');
            });
        }

    } catch (error) {
        console.error('Error loading lootboxes:', error);
        showNotification('Ошибка загрузки сундуков', 'error', error);
    }
}

async function openLootbox(boxType) {
    try {
        soundManager.play('button');

        const response = await fetch(`${API_BASE_URL}/lootbox/open`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: TELEGRAM_ID, boxType })
        });

        if (!response.ok) {
            const error = await response.json();
            showNotification(error.error || 'Ошибка', 'error');
            return;
        }

        const data = await response.json();

        // Show reward animation
        showLootboxReward(data.reward);

        // Update user data
        userData.balance = data.balance;
        userData.fuel = data.fuel;
        userData.stamina = data.stamina;
        userData.lootboxes = data.lootboxes;

        // Reload lootboxes
        await loadLootboxes();
        updateUI();

        soundManager.play('coin');

    } catch (error) {
        console.error('Error opening lootbox:', error);
        showNotification('Ошибка сервера', 'error', error);
    }
}

function showLootboxReward(reward) {
    const rewardDiv = document.getElementById('lootbox-reward');

    let icon = '';
    switch (reward.type) {
        case 'money': icon = '💰'; break;
        case 'fuel': icon = '⛽'; break;
        case 'stamina': icon = '⚡'; break;
        case 'car': icon = '🚗'; break;
        case 'exclusive_car': icon = '🏎️'; break;
        case 'upgrade': icon = '⚙️'; break;
        case 'all_upgrades': icon = '🔧'; break;
    }

    rewardDiv.innerHTML = `
        <div class="reward-icon">${icon}</div>
        <div class="reward-text">${reward.message}</div>
        <button class="reward-close-btn" onclick="closeLootboxReward()">Забрать</button>
    `;

    rewardDiv.style.display = 'block';
}

function closeLootboxReward() {
    document.getElementById('lootbox-reward').style.display = 'none';
}

// Initialize event listeners
function initCasinoAndLootbox() {
    // Other initializations can go here if needed

    document.getElementById('back-from-casino')?.addEventListener('click', () => {
        showScreen('main');
    });

    // Lootbox navigation back button
    document.getElementById('back-from-lootbox')?.addEventListener('click', () => {
        showScreen('main');
    });

    // Slot machine
    document.querySelectorAll('.bet-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const bet = parseInt(btn.dataset.bet);
            playSlots(bet);
        });
    });

    // Roulette
    document.getElementById('spin-roulette-btn')?.addEventListener('click', playRoulette);

    // Crash
    document.getElementById('crash-start-btn')?.addEventListener('click', startCrash);
    document.getElementById('crash-cashout-btn')?.addEventListener('click', cashoutCrash);

    // Start polling automatically when on casino/crash screen logic should be here
    // But for simplicity, we can just check if screen is visible in updateCrashStatus
    if (!crashPollInterval) {
        crashPollInterval = setInterval(updateCrashStatus, 500);
    }

    // Custom Slots Bet
    document.getElementById('slots-custom-btn')?.addEventListener('click', () => {
        const bet = parseInt(document.getElementById('slots-custom-bet').value);
        if (!isNaN(bet) && bet >= 10) {
            playSlots(bet);
        } else {
            showNotification('Минимальная ставка 10 PLN', 'error');
        }
    });

    // Lootbox opening
    document.querySelectorAll('.open-lootbox-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            openLootbox(type);
        });
    });
}
// Initialize on load
console.log('🎰 casino.js loaded, calling initCasinoAndLootbox()');
initCasinoAndLootbox();
