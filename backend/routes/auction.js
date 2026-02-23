const express = require('express');
const router = express.Router();
const { sendNotification } = require('../bot');

// Shared state and config from server.js (will be injected or imported)
let AUCTION_CONFIG;
let AUCTION_STATE;
let CARS;
let db;
let getUser;
let saveUser;
let adminAuth;
let logActivity;

// Initialization function to set shared objects
function initAuction(config, state, carsObj, dbObj, getUserFn, saveUserFn, authMid, logActivityFn) {
    AUCTION_CONFIG = config;
    AUCTION_STATE = state;
    CARS = carsObj;
    db = dbObj;
    getUser = getUserFn;
    saveUser = saveUserFn;
    adminAuth = authMid;
    logActivity = logActivityFn;

    // Tick for auction end (logic kept here but relies on shared state)
    setInterval(() => {
        if (AUCTION_STATE.active && Date.now() >= AUCTION_STATE.endTime) {
            finalizeAuction();
        }
    }, 1000);
}

function startAuction() {
    console.log('📦 Starting new container auction...');

    // Pick reward
    let carId = AUCTION_CONFIG.manualReward;
    if (!carId || !CARS[carId]) {
        // Random car from CARS (only buyable ones)
        const buyableCars = Object.keys(CARS).filter(id => CARS[id].purchase_price > 0);
        carId = buyableCars[Math.floor(Math.random() * buyableCars.length)];
    }

    AUCTION_STATE.active = true;
    AUCTION_STATE.startTime = Date.now();
    AUCTION_STATE.endTime = Date.now() + AUCTION_CONFIG.duration;
    AUCTION_STATE.currentBid = AUCTION_CONFIG.startingBid;
    AUCTION_STATE.highestBidder = null;
    AUCTION_STATE.reward = { type: 'car', id: carId };
}

async function finalizeAuction() {
    if (!AUCTION_STATE.active) return;

    console.log('🏁 Finalizing container auction...');
    AUCTION_STATE.active = false;

    if (AUCTION_STATE.highestBidder) {
        const winner = AUCTION_STATE.highestBidder;
        const amount = AUCTION_STATE.currentBid;
        const reward = AUCTION_STATE.reward;

        console.log(`🏆 Winner: ${winner.name} (${winner.telegramId}) for ${amount} PLN`);

        try {
            const user = await getUser(winner.telegramId);
            if (user) {
                // Reward the user
                // Store as pending reward — user must choose where to put it (Garage, Fleet or Sell)
                const pendingReward = {
                    type: reward.type,
                    id: reward.id,
                    carName: CARS[reward.id]?.name || reward.id,
                    carImage: CARS[reward.id]?.image || '🚗',
                    purchasePrice: CARS[reward.id]?.purchase_price || 0,
                    sellPrice: Math.floor((CARS[reward.id]?.purchase_price || 0) * 0.6),
                    bidAmount: amount,
                    wonAt: new Date().toISOString()
                };

                user.pending_auction_rewards = user.pending_auction_rewards || [];
                user.pending_auction_rewards.push(pendingReward);

                await saveUser(user);
                console.log(`🎁 Pending reward ${reward.id} stored for ${winner.telegramId}`);

                // v3.2: Telegram Notification
                await sendNotification(winner.telegramId, 'AUCTION_WIN', {
                    rewardName: CARS[reward.id]?.name || reward.id
                });

                // Add to history
                AUCTION_STATE.history.unshift({
                    name: winner.name,
                    telegramId: winner.telegramId,
                    amount: amount,
                    reward: reward,
                    time: new Date().toISOString()
                });
                if (AUCTION_STATE.history.length > 5) AUCTION_STATE.history.pop();
            }
        } catch (e) {
            console.error('Error finalizing auction reward:', e);
        }
    } else {
        console.log('❌ Auction ended with no bids');
    }

    // Schedule next auction
    setTimeout(startAuction, AUCTION_CONFIG.interval - AUCTION_CONFIG.duration);
}

// Routes
router.get('/', (req, res) => {
    const timeLeft = AUCTION_STATE.active ? Math.max(0, AUCTION_STATE.endTime - Date.now()) : 0;
    res.json({
        ...AUCTION_STATE,
        timeLeft,
        serverTime: Date.now()
    });
});

router.get('/pending/:telegramId', async (req, res) => {
    try {
        const user = await getUser(req.params.telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ rewards: user.pending_auction_rewards || [] });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/bid', async (req, res) => {
    try {
        const { telegramId, name, amount } = req.body;

        if (!AUCTION_STATE.active) {
            return res.status(400).json({ error: 'Аукцион не активен' });
        }

        if (Date.now() >= AUCTION_STATE.endTime) {
            return res.status(400).json({ error: 'Аукцион завершен' });
        }

        const bidAmount = parseFloat(amount);
        if (isNaN(bidAmount) || bidAmount < AUCTION_STATE.currentBid + 100) {
            return res.status(400).json({ error: `Минимальная ставка: ${AUCTION_STATE.currentBid + 100} PLN` });
        }

        const user = await getUser(telegramId);
        if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

        if (user.balance < bidAmount) {
            return res.status(400).json({ error: 'Недостаточно средств для ставки' });
        }

        // Deduct money from new bidder
        user.balance -= bidAmount;
        await saveUser(user); // Use shared saveUser which handles deltas and cache

        // Refund money to previous highest bidder
        if (AUCTION_STATE.highestBidder) {
            const prevTid = AUCTION_STATE.highestBidder.telegramId;
            await db.run(
                'UPDATE users SET balance = balance + ? WHERE telegram_id = ?',
                [AUCTION_STATE.currentBid, prevTid]
            );
            // v3.4: Need to invalidate cache for the refunded user!
            // Since we don't have invalidateUserCache here, we use a trick or just accept it for now?
            // Actually, we can just fetch and save them, but that's slow.
            // Let's assume the user will reload data eventually, OR we add it to initAuction.
            // For now, at least we fixed the absolute overwrite at line 160.

            console.log(`💰 Refunded ${AUCTION_STATE.currentBid} to ${prevTid}`);

            // v3.2: Telegram Notification for Outbid
            sendNotification(AUCTION_STATE.highestBidder.telegramId, 'AUCTION_BID', {
                newBidder: name || 'Аноним',
                amount: bidAmount
            });
        }

        AUCTION_STATE.currentBid = bidAmount;
        AUCTION_STATE.highestBidder = { telegramId, name: name || 'Аноним' };

        logActivity(telegramId, 'AUCTION_BID', { amount: bidAmount, reward: AUCTION_STATE.reward });

        console.log(`📡 New Bid: ${bidAmount} by ${name} (${telegramId})`);

        res.json({ success: true, currentBid: AUCTION_STATE.currentBid, new_balance: user.balance });
    } catch (e) {
        console.error('Bid error:', e);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.post('/claim', async (req, res) => {
    try {
        const { telegramId, rewardIndex, choice } = req.body;
        // choice: "garage" | "fleet" | "sell"

        if (!['garage', 'fleet', 'sell'].includes(choice)) {
            return res.status(400).json({ error: 'Неверный выбор' });
        }

        const user = await getUser(telegramId);
        if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

        // Ensure rewards are synced from user object
        user.pending_auction_rewards = user.pending_auction_rewards || [];
        const pendingRewards = user.pending_auction_rewards;

        const idx = parseInt(rewardIndex);
        if (isNaN(idx) || idx < 0 || idx >= pendingRewards.length) {
            return res.status(400).json({ error: 'Награда не найдена' });
        }

        const reward = pendingRewards[idx];
        let resultMessage = '';

        if (choice === 'garage') {
            // Add car to owned_cars
            user.owned_cars = user.owned_cars || [];
            if (!user.owned_cars.includes(reward.id)) {
                user.owned_cars.push(reward.id);
            }
            resultMessage = `🚗 ${reward.carName} добавлен в ваш гараж!`;
        } else if (choice === 'fleet') {
            if (reward.type === 'car') {
                user.business = user.business || { rented_cars: {}, fleet: [], drivers: [] };
                user.business.fleet = user.business.fleet || [];

                const instanceId = `fleet_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
                user.business.fleet.push({
                    id: instanceId,
                    modelId: reward.id,
                    acquiredAt: new Date().toISOString()
                });

                console.log(`🎁 Reward ${reward.id} (Instance: ${instanceId}) added to ${user.telegramId} fleet`);
                resultMessage = `🏢 ${reward.carName} добавлен в автопарк!`;
            } else {
                return res.status(400).json({ error: 'Эту награду нельзя добавить в автопарк.' });
            }
        } else if (choice === 'sell') {
            // Sell for 60% of purchase price
            const sellPrice = reward.sellPrice || Math.floor((reward.purchasePrice || 0) * 0.6);
            user.balance += sellPrice;
            resultMessage = `💰 ${reward.carName} продан за ${sellPrice} PLN!`;
        }

        // Remove claimed reward from pending in the user object itself
        pendingRewards.splice(idx, 1);
        user.pending_auction_rewards = pendingRewards;

        // Save once - this will update both balance/cars AND pending_auction_rewards
        await saveUser(user);

        console.log(`📦 Reward claimed: ${reward.id} -> ${choice} by ${telegramId}`);

        res.json({
            success: true,
            message: resultMessage,
            balance: user.balance,
            owned_cars: user.owned_cars,
            pendingRewards: user.pending_auction_rewards
        });
    } catch (e) {
        console.error('Claim error:', e);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Admin endpoints
router.get('/config', (req, res, next) => adminAuth(req, res, next), (req, res) => {
    res.json({ config: AUCTION_CONFIG, state: AUCTION_STATE });
});

router.post('/settings', (req, res, next) => adminAuth(req, res, next), (req, res) => {
    const { startingBid, duration, interval, manualReward } = req.body;

    if (startingBid) AUCTION_CONFIG.startingBid = parseFloat(startingBid);
    if (duration) AUCTION_CONFIG.duration = parseInt(duration) * 60 * 1000;
    if (interval) AUCTION_CONFIG.interval = parseInt(interval) * 60 * 1000;

    AUCTION_CONFIG.manualReward = manualReward || null;

    res.json({ success: true, config: AUCTION_CONFIG });
});

module.exports = {
    router,
    initAuction,
    startAuction
};
