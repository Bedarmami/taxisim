// ============= v2.3: RETENTION FEATURES =============

// Load and display current event
async function loadCurrentEvent() {
    try {
        const data = await safeFetchJson(`${API_BASE_URL.replace('/api', '')}/api/current-event`);
        if (data && !data._isError && data.active && data.event) {
            const event = data.event;
            const minutes = Math.floor(data.event.timeLeft / 60000);
            const seconds = Math.floor((data.event.timeLeft % 60000) / 1000);

            banner.innerHTML = `
                <div class="event-icon">${event.icon}</div>
                <div class="event-name">${event.name}</div>
                <div class="event-desc">${event.description}</div>
                <div class="event-timer">⏱️ Осталось: ${minutes}:${seconds.toString().padStart(2, '0')}</div>
            `;
            banner.style.display = 'block';
        } else {
            banner.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading event:', error);
    }
}

// Update stamina countdown timer
function updateStaminaTimer() {
    if (!userData) return;

    const staminaTimerEl = document.getElementById('stamina-countdown');
    const coffeeBtn = document.getElementById('buy-coffee-btn');

    if (!staminaTimerEl || !coffeeBtn) return;

    if (userData.stamina >= 100) {
        staminaTimerEl.textContent = 'Полная';
        coffeeBtn.disabled = true;
        return;
    }

    // Calculate time to next stamina point (5 minutes per point)
    const now = new Date();
    const lastUpdate = userData.last_stamina_update ? new Date(userData.last_stamina_update) : now;
    const timeSinceUpdate = now - lastUpdate;
    const timeToNext = (5 * 60 * 1000) - (timeSinceUpdate % (5 * 60 * 1000));

    const minutes = Math.floor(timeToNext / 60000);
    const seconds = Math.floor((timeToNext % 60000) / 1000);

    staminaTimerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    coffeeBtn.disabled = userData.balance < 100;
}

// Buy coffee
async function buyCoffee() {
    try {
        soundManager.play('button');

        const data = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/buy-coffee`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (data && !data._isError) {
            userData.balance = data.balance;
            userData.stamina = data.stamina;

            updateUI();
            showNotification(data.message, 'success');
            soundManager.play('coin');
        } else {
            showNotification(data?.error || 'Ошибка покупки кофе', 'error');
        }
    } catch (error) {
        console.error('Error buying coffee:', error);
        showNotification('Ошибка сервера', 'error');
    }
}

// Update streak display
function updateStreakDisplay() {
    if (!userData) return;

    const streakDays = document.getElementById('streak-days');
    const claimBtn = document.getElementById('claim-streak-btn');

    if (streakDays) {
        streakDays.textContent = userData.login_streak || 0;
    }

    // Show claim button if streak > 0 and not claimed today
    if (claimBtn && userData.login_streak > 0) {
        const today = new Date().toISOString().split('T')[0];
        const lastClaim = userData.last_streak_claim ? userData.last_streak_claim.split('T')[0] : null;

        if (lastClaim !== today) {
            claimBtn.style.display = 'inline-block';
        } else {
            claimBtn.style.display = 'none';
        }
    }
}

// Claim streak reward
async function claimStreakReward() {
    try {
        soundManager.play('button');

        const data = await safeFetchJson(`${API_BASE_URL}/user/${TELEGRAM_ID}/claim-streak`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (data && !data._isError) {
            userData.balance = data.balance;
            userData.fuel = data.fuel;
            userData.stamina = data.stamina;
            userData.last_streak_claim = new Date().toISOString();

            updateUI();
            showNotification(data.reward.message, 'success');
            soundManager.play('coin');

            document.getElementById('claim-streak-btn').style.display = 'none';
        } else {
            showNotification(data?.error || 'Ошибка получения награды', 'error');
        }
    } catch (error) {
        console.error('Error claiming streak:', error);
        showNotification('Ошибка сервера', 'error');
    }
}

// Start intervals for v2.3 features
function startRetentionIntervals() {
    // Update event every 30 seconds
    if (eventInterval) clearInterval(eventInterval);
    eventInterval = setInterval(loadCurrentEvent, 30000);
    loadCurrentEvent();

    // Update stamina timer every second
    if (staminaInterval) clearInterval(staminaInterval);
    staminaInterval = setInterval(updateStaminaTimer, 1000);
    updateStaminaTimer();
}
