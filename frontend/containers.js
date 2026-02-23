class ContainersManager {
    constructor() {
        this.state = {
            active: false,
            timeLeft: 0,
            currentBid: 0,
            highestBidder: null,
            reward: null,
            history: [],
            serverTime: Date.now()
        };
        this.pollInterval = null;
        this.timerInterval = null;
        this.init();
    }

    init() {
        // Bid button
        const bidBtn = document.getElementById('place-bid-btn');
        if (bidBtn) bidBtn.addEventListener('click', () => this.placeBid());
    }

    // Called by showScreen('containers') in script.js
    onScreenOpen() {
        this.sync();
        this.checkPendingRewards();
        if (!this.pollInterval) {
            this.pollInterval = setInterval(() => this.sync(), 3000);
        }
        if (!this.timerInterval) {
            this.timerInterval = setInterval(() => this.updateTimerUI(), 1000);
        }
    }

    // Called when navigating away
    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    async sync() {
        try {
            const res = await fetch(`${API_BASE_URL}/auction`);
            const data = await res.json();

            this.state = {
                ...data,
                localSyncTime: Date.now()
            };

            this.render();
        } catch (e) {
            console.error('Error syncing auction:', e);
        }
    }

    render() {
        const bidEl = document.getElementById('current-auction-bid');
        const bidderEl = document.getElementById('current-auction-bidder');
        const statusEl = document.getElementById('auction-status');
        const timerEl = document.getElementById('auction-timer');
        const placeBidBtn = document.getElementById('place-bid-btn');

        if (!statusEl || !bidEl || !bidderEl || !timerEl || !placeBidBtn) return;

        if (this.state.active) {
            statusEl.textContent = 'ИДЕТ АУКЦИОН';
            statusEl.className = 'auction-status-badge active';
            bidEl.textContent = `${this.state.currentBid} PLN`;
            bidderEl.textContent = this.state.highestBidder ? this.state.highestBidder.name : 'Ставок нет';
            placeBidBtn.disabled = false;

            const bidInput = document.getElementById('auction-bid-input');
            if (bidInput) {
                const minBid = this.state.currentBid + 100;
                if (parseInt(bidInput.value) < minBid) {
                    bidInput.value = minBid;
                }
            }
        } else {
            statusEl.textContent = 'ОЖИДАНИЕ';
            statusEl.className = 'auction-status-badge waiting';
            bidEl.textContent = '---';
            bidderEl.textContent = '---';
            timerEl.textContent = '00:00';
            placeBidBtn.disabled = true;
        }

        // Render History
        const historyList = document.getElementById('auction-history-list');
        if (historyList && this.state.history) {
            historyList.innerHTML = this.state.history.map(h => `
                <div class="history-item">
                    <span class="h-name">🏆 ${h.name}</span>
                    <span class="h-amount">${h.amount} PLN</span>
                    <span class="h-reward">${h.reward ? h.reward.id : '?'}</span>
                </div>
            `).join('') || '<div style="opacity:0.5; text-align:center;">Победителей пока нет</div>';
        }
    }

    updateTimerUI() {
        if (!this.state.active) return;

        const timerEl = document.getElementById('auction-timer');
        if (!timerEl) return;

        const elapsedSinceSync = Date.now() - this.state.localSyncTime;
        const currentRemaining = Math.max(0, this.state.timeLeft - elapsedSinceSync);

        const minutes = Math.floor(currentRemaining / 60000);
        const seconds = Math.floor((currentRemaining % 60000) / 1000);
        timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        if (currentRemaining <= 0 && this.state.active) {
            this.state.active = false;
            this.sync();
        }
    }

    async placeBid() {
        const bidInput = document.getElementById('auction-bid-input');
        if (!bidInput) return;

        const amount = parseInt(bidInput.value);
        if (isNaN(amount)) return;

        if (amount < this.state.currentBid + 100) {
            showNotification(`Минимальная ставка: ${this.state.currentBid + 100} PLN`, 'error');
            return;
        }

        try {
            const user = typeof Telegram !== 'undefined' ? Telegram.WebApp.initDataUnsafe?.user : null;
            const res = await fetch(`${API_BASE_URL}/auction/bid`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegramId: TELEGRAM_ID,
                    name: (user && user.first_name) ? user.first_name : 'Водитель',
                    amount: amount
                })
            });

            const data = await res.json();
            if (data.success) {
                showNotification('Ставка принята!', 'success');
                if (typeof soundManager !== 'undefined') soundManager.play('button');
                this.sync();
            } else {
                showNotification(data.error || 'Ошибка при ставке', 'error');
            }
        } catch (e) {
            console.error('Bid error:', e);
            showNotification('Ошибка сервера', 'error');
        }
    }

    // ===== PENDING REWARDS =====
    async checkPendingRewards() {
        try {
            const res = await fetch(`${API_BASE_URL}/auction/pending/${TELEGRAM_ID}`);
            const data = await res.json();

            if (data.rewards && data.rewards.length > 0) {
                this.showRewardModal(data.rewards[0], 0);
            }
        } catch (e) {
            console.error('Error checking pending rewards:', e);
        }
    }

    showRewardModal(reward, index) {
        // Remove existing modal if any
        const existing = document.getElementById('auction-reward-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'auction-reward-modal';
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content reward-choice-modal">
                <div class="reward-header">
                    <div class="reward-confetti">🎉</div>
                    <h2>Поздравляем!</h2>
                    <p class="reward-subtitle">Вы выиграли на аукционе</p>
                </div>

                <div class="reward-car-showcase">
                    <div class="reward-car-icon">${reward.carImage || '🚗'}</div>
                    <div class="reward-car-name">${reward.carName}</div>
                    <div class="reward-car-price">Рыночная цена: ${reward.purchasePrice} PLN</div>
                </div>

                <div class="reward-choices">
                    <button class="reward-choice-btn garage-choice" data-choice="garage">
                        <span class="choice-icon">🏠</span>
                        <span class="choice-label">В гараж</span>
                        <span class="choice-desc">Использовать лично</span>
                    </button>

                    <button class="reward-choice-btn fleet-choice" data-choice="fleet">
                        <span class="choice-icon">🏢</span>
                        <span class="choice-label">В автопарк</span>
                        <span class="choice-desc">Для бизнеса</span>
                    </button>

                    <button class="reward-choice-btn sell-choice" data-choice="sell">
                        <span class="choice-icon">💰</span>
                        <span class="choice-label">Продать</span>
                        <span class="choice-desc">${reward.sellPrice} PLN (60%)</span>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Bind choice buttons
        modal.querySelectorAll('.reward-choice-btn').forEach(btn => {
            const originalHTML = btn.innerHTML;
            btn.addEventListener('click', async () => {
                const choice = btn.dataset.choice;

                // Disable all buttons in the modal
                modal.querySelectorAll('.reward-choice-btn').forEach(b => b.disabled = true);

                const labelEl = btn.querySelector('.choice-label');
                const oldLabel = labelEl ? labelEl.textContent : '';
                if (labelEl) labelEl.textContent = '⏳...';

                try {
                    console.log(`📡 Claiming auction reward ${reward.id} with choice: ${choice}`);
                    const res = await fetch(`${API_BASE_URL}/auction/claim`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            telegramId: TELEGRAM_ID,
                            rewardIndex: index,
                            choice: choice
                        })
                    });

                    const data = await res.json();
                    if (data.success) {
                        showNotification(data.message, 'success');
                        modal.remove();
                        // Refresh user data to show new balance/cars
                        if (typeof loadUserData === 'function') await loadUserData();
                        // Check if there are more rewards in the queue
                        this.checkPendingRewards();
                    } else {
                        showNotification(data.error || 'Ошибка при получении награды', 'error');
                        // Re-enable buttons on failure
                        modal.querySelectorAll('.reward-choice-btn').forEach(b => b.disabled = false);
                        if (labelEl) labelEl.textContent = oldLabel;
                    }
                } catch (e) {
                    console.error('Claim error:', e);
                    showNotification('Ошибка соединения с сервером', 'error');
                    // Re-enable buttons on failure
                    modal.querySelectorAll('.reward-choice-btn').forEach(b => b.disabled = false);
                    if (labelEl) labelEl.textContent = oldLabel;
                }
            });
        });
    }
}

// Global functions for HTML onclicks
window.adjustAuctionBid = (step) => {
    const input = document.getElementById('auction-bid-input');
    if (!input) return;
    const newVal = Math.max(0, (parseInt(input.value) || 0) + step);
    input.value = newVal;
};

const containersManager = new ContainersManager();
