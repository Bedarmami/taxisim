// v2.4: Casino and Lootbox API Endpoints

// Play Slots
app.post('/api/casino/slots', async (req, res) => {
    try {
        const { telegramId, bet } = req.body;
        const user = await getUser(telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Validate bet
        if (![50, 100, 200].includes(bet)) {
            return res.status(400).json({ error: 'Invalid bet amount' });
        }

        if (user.balance < bet) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        // Reset daily spins if needed
        resetCasinoSpins(user);

        if (user.casino_spins_today >= 10) {
            return res.status(400).json({ error: 'Daily spin limit reached (10/day)' });
        }

        // Play
        const result = spinSlots(bet);
        user.balance -= bet;
        user.balance += result.winAmount;
        user.casino_spins_today++;

        // v5.0: Jackpot Contribution (1% of bet)
        const jackpotTax = bet * 0.01;
        JACKPOT_POOL += jackpotTax;
        await saveJackpot();

        // Update stats

        // Update stats
        user.casino_stats = user.casino_stats || { total_won: 0, total_lost: 0, spins: 0 };
        user.casino_stats.spins++;
        if (result.winAmount > bet) {
            user.casino_stats.total_won += (result.winAmount - bet);
        } else {
            user.casino_stats.total_lost += (bet - result.winAmount);
        }

        await saveUser(user);

        res.json({
            success: true,
            result,
            balance: user.balance,
            spins_left: 10 - user.casino_spins_today
        });
    } catch (error) {
        console.error('Error playing slots:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Play Roulette
app.post('/api/casino/roulette', async (req, res) => {
    try {
        const { telegramId, bet } = req.body;
        const user = await getUser(telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (bet !== 100) {
            return res.status(400).json({ error: 'Roulette bet must be 100 PLN' });
        }

        if (user.balance < bet) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        resetCasinoSpins(user);

        if (user.casino_spins_today >= 10) {
            return res.status(400).json({ error: 'Daily spin limit reached (10/day)' });
        }

        const result = spinRoulette(bet);
        user.balance -= bet;
        user.balance += result.winAmount;
        user.casino_spins_today++;

        // v5.0: Jackpot Contribution (1% of bet)
        const jackpotTax = bet * 0.01;
        JACKPOT_POOL += jackpotTax;
        await saveJackpot();

        user.casino_stats = user.casino_stats || { total_won: 0, total_lost: 0, spins: 0 };
        user.casino_stats.spins++;
        if (result.winAmount > bet) {
            user.casino_stats.total_won += (result.winAmount - bet);
        } else {
            user.casino_stats.total_lost += (bet - result.winAmount);
        }

        await saveUser(user);

        res.json({
            success: true,
            result,
            balance: user.balance,
            spins_left: 10 - user.casino_spins_today
        });
    } catch (error) {
        console.error('Error playing roulette:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Open Lootbox
app.post('/api/lootbox/open', async (req, res) => {
    try {
        const { telegramId, boxType } = req.body;
        const user = await getUser(telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.lootboxes = user.lootboxes || { wooden: 0, silver: 0, gold: 0, legendary: 0 };

        if (!user.lootboxes[boxType] || user.lootboxes[boxType] <= 0) {
            return res.status(400).json({ error: 'No lootbox of this type' });
        }

        const reward = openLootbox(boxType);
        if (!reward) {
            return res.status(500).json({ error: 'Failed to open lootbox' });
        }

        // Apply reward
        switch (reward.type) {
            case 'money':
                user.balance += reward.amount;
                break;
            case 'fuel':
                user.fuel = Math.min(user.max_fuel || 45, user.fuel + reward.amount);
                break;
            case 'stamina':
                user.stamina = Math.min(100, user.stamina + reward.amount);
                break;
            case 'car':
            case 'exclusive_car':
                if (reward.carId) {
                    user.pending_auction_rewards = user.pending_auction_rewards || [];
                    user.pending_auction_rewards.push({
                        type: 'car',
                        id: reward.carId,
                        carName: CARS[reward.carId]?.name || reward.carId,
                        carImage: CARS[reward.carId]?.image || '🚗',
                        purchasePrice: CARS[reward.carId]?.purchase_price || 0,
                        sellPrice: Math.floor((CARS[reward.carId]?.purchase_price || 0) * 0.6),
                        wonAt: new Date().toISOString(),
                        source: 'lootbox'
                    });
                    console.log(`🎁 Reward ${reward.carId} from lootbox added to ${telegramId} pending rewards`);
                }
                break;
            case 'free_plate_roll':
                user.free_plate_rolls = (user.free_plate_rolls || 0) + 1;
                break;
        }

        user.lootboxes[boxType]--;
        await saveUser(user);

        res.json({
            success: true,
            reward,
            balance: user.balance,
            fuel: user.fuel,
            stamina: user.stamina,
            lootboxes: user.lootboxes
        });
    } catch (error) {
        console.error('Error opening lootbox:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get lootboxes
app.get('/api/lootbox/:telegramId', async (req, res) => {
    try {
        const user = await getUser(req.params.telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Check for new lootboxes
        const newBoxes = checkLootboxMilestones(user);
        if (newBoxes.length > 0) {
            await saveUser(user);
        }

        res.json({
            lootboxes: user.lootboxes || { wooden: 0, silver: 0, gold: 0, legendary: 0 },
            newBoxes
        });
    } catch (error) {
        console.error('Error getting lootboxes:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
