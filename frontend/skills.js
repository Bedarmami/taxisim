class SkillsManager {
    constructor() {
        this.skills = { charisma: 0, mechanic: 0, navigator: 0 };
        this.balance = 0;
        this.skillCosts = [500, 500, 1500, 4500, 10000, 25000]; // cost for next level
        this.init();
    }

    init() {
        const btn = document.getElementById('skills-btn');
        if (btn) btn.addEventListener('click', () => this.openScreen());

        const backBtn = document.getElementById('back-from-skills');
        if (backBtn) backBtn.addEventListener('click', () => showScreen('main'));

        // Upgrade buttons (match HTML data-skill attributes)
        document.querySelectorAll('.upgrade-btn[data-skill]').forEach(btn => {
            btn.addEventListener('click', () => {
                const skill = btn.dataset.skill;
                const level = this.skills[skill] || 0;
                const cost = this.skillCosts[level] || 25000;
                this.upgrade(skill, cost);
            });
        });
    }

    openScreen() {
        showScreen('skills');
    }

    closeScreen() {
        showScreen('main');
        if (window.updateUI) window.updateUI();
    }

    async loadData() {
        const user = Telegram.WebApp.initDataUnsafe?.user;
        const telegramId = user ? user.id : 'test_user';

        try {
            const data = await safeFetchJson(`${API_BASE_URL}/user/${telegramId}`);
            if (data && !data._isError) {
                if (data.error) {
                    showNotification(data.error, 'error');
                    return;
                }

                this.skills = data.skills || { charisma: 0, mechanic: 0, navigator: 0 };
                this.balance = data.balance;
                this.render();
            }
        } catch (e) {
            console.error('Error loading skills:', e);
            showNotification('Ошибка загрузки навыков', 'error');
        }
    }

    render() {
        // Update balance display
        const balEl = document.getElementById('skills-balance');
        if (balEl) balEl.textContent = this.balance.toFixed(2);

        // Update each skill level and cost
        ['charisma', 'mechanic', 'navigator'].forEach(skill => {
            const level = this.skills[skill] || 0;
            const nextCost = level >= 5 ? 'MAX' : this.skillCosts[level];

            const levelEl = document.getElementById(`skill-${skill}-level`);
            const costEl = document.getElementById(`skill-${skill}-cost`);

            if (levelEl) levelEl.textContent = level;
            if (costEl) costEl.textContent = level >= 5 ? 'MAX' : `${nextCost} PLN`;
        });

        // Disable buttons if max or can't afford
        document.querySelectorAll('.upgrade-btn[data-skill]').forEach(btn => {
            const skill = btn.dataset.skill;
            const level = this.skills[skill] || 0;
            const cost = this.skillCosts[level] || 25000;
            btn.disabled = level >= 5 || this.balance < cost;
        });
    }

    async upgrade(skill, cost) {
        if (this.balance < cost) {
            showNotification('Недостаточно средств!', 'error');
            return;
        }

        const user = Telegram.WebApp.initDataUnsafe?.user;
        const telegramId = user ? user.id : 'test_user';

        try {
            const data = await safeFetchJson(`${API_BASE_URL}/user/${telegramId}/skills/upgrade`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skill })
            });

            if (data && !data._isError && data.success) {
                showNotification(data.message, 'success');
                this.loadData(); // Refresh UI
            } else {
                showNotification(data?.error || 'Ошибка улучшения навыка', 'error');
            }
        } catch (e) {
            console.error(e);
            showNotification('Ошибка улучшения навыка', 'error');
        }
    }
}

window.skillsManager = new SkillsManager();
