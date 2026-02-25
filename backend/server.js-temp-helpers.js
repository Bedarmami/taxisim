
/**
 * v3.5: Helper for atomic stamina/fuel updates to prevent race conditions.
 */
async function updateStaminaAtomic(telegramId, amount) {
    if (isNaN(amount) || amount === 0) return true;

    // amount is negative for consumption
    const result = await db.run('UPDATE users SET stamina = stamina + ? WHERE telegram_id = ? AND stamina + ? >= 0', [amount, telegramId, amount]);
    if (result.changes === 0) return false; // Not enough stamina or user not found

    invalidateUserCache(telegramId);
    return true;
}

async function updateFuelAtomic(telegramId, fuelAmount, gasAmount) {
    // Both amounts should be negative for consumption
    const fAmt = isNaN(fuelAmount) ? 0 : fuelAmount;
    const gAmt = isNaN(gasAmount) ? 0 : gasAmount;

    if (fAmt === 0 && gAmt === 0) return true;

    const result = await db.run(
        'UPDATE users SET fuel = fuel + ?, gas_fuel = gas_fuel + ? WHERE telegram_id = ? AND fuel + ? >= 0 AND gas_fuel + ? >= 0',
        [fAmt, gAmt, telegramId, fAmt, gAmt]
    );

    if (result.changes === 0) return false;

    invalidateUserCache(telegramId);
    return true;
}

const LAST_REST_TIME = new Map();
const REST_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
