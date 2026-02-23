const db = require('./db');

// EU-styled format: AA-111-BB
function generateRandomPlate() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';

    const l1 = letters[Math.floor(Math.random() * letters.length)];
    const l2 = letters[Math.floor(Math.random() * letters.length)];
    const n = Math.floor(Math.random() * 900) + 100; // 100-999
    const l3 = letters[Math.floor(Math.random() * letters.length)];
    const l4 = letters[Math.floor(Math.random() * letters.length)];

    return `${l1}${l2}-${n}-${l3}${l4}`;
}

function calculatePlatePrice(text) {
    const basePrice = 500000;
    const charSurcharge = 750000;
    const baseLength = 4;

    if (text.length <= baseLength) return basePrice;

    const extraChars = text.length - baseLength;
    return Math.min(5000000, basePrice + (extraChars * charSurcharge));
}

function validatePlate(text) {
    // Max 10 chars, alphanumeric + hyphens
    const regex = /^[A-Z0-9-]{1,10}$/;
    if (!regex.test(text.toUpperCase())) return false;

    // Block Russian registration format patterns like X000XX77 or X000XX
    const russianPattern = /^[A-Z]\d{3}[A-Z]{2}(\d{2,3})?$/i;
    if (russianPattern.test(text)) return false;

    return true;
}

function getRarity(plateNumber) {
    // Beautiful numbers logic
    const clean = plateNumber.replace(/-/g, '').toUpperCase();

    // Check for triple numbers 777, 000, etc
    if (/(\d)\1\1/.test(clean)) return 'legendary';

    // Check for names/words (all letters)
    if (/^[A-Z]{3,10}$/.test(clean)) return 'rare';

    // Check for "special" keywords
    const specials = ['BOSS', 'GOLD', 'KING', 'WIN', 'TG', 'TAXI'];
    if (specials.some(s => clean.includes(s))) return 'legendary';

    return 'common';
}

function getBuffs(rarity) {
    switch (rarity) {
        case 'legendary':
            return { tip_multiplier: 1.25, police_resistance: 0.5 }; // +25% tips, -50% police
        case 'rare':
            return { tip_multiplier: 1.15, police_resistance: 0.8 }; // +15% tips, -20% police
        default:
            return { tip_multiplier: 1.05, police_resistance: 1.0 }; // +5% tips
    }
}

module.exports = {
    generateRandomPlate,
    calculatePlatePrice,
    validatePlate,
    getRarity,
    getBuffs
};
