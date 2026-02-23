# 🚕 Taxi Simulator (Telegram Web App)

A premium, feature-rich taxi simulator built as a Telegram Web App. Players can earn money, collect unique license plates, manage a fleet, and participate in global auctions.

## 🚀 Key Features

### 💎 License Plate System (v3.3)
- **Unique Collectibles**: Every license plate is globally unique. No two players can own the same number.
- **Rarity & Buffs**:
  - **Common**: Standard plates.
  - **Rare (Gold)**: +15% Tips, -20% Police risk.
  - **Legendary (Neon)**: +25% Tips, -50% Police risk, with glowing UI effects.
- **Marketplace**: P2P trading where players can buy and sell "beautiful" numbers.
- **Custom Creation**: High-end vanity plates for the most successful drivers.

### 🛡️ High Reliability Core (v3.4)
- **Atomic Balance Delta**: Specialized persistence layer preventing data loss during race conditions.
- **Consistency Gurantee**: System-wide cache management ensuring real-time balance accuracy across all platforms.
- **Robust Error Handling**: Global error reporting and automated log analysis.

### 🏢 Game Mechanics
- **City Districts**: Unlock new areas (Suburbs, Center, Airport) with different rewards and traffic conditions.
- **Container Auctions**: Real-time bidding for rare vehicles and items.
- **Fleet Management**: Hire drivers and expand your business empire.
- **Casino & Lootboxes**: Dynamic reward systems with visual slot machines and roulette.

### 🤖 AI Support System
- Integrated Google Gemini AI for instant player support and gameplay advice directly in-game.

## 🛠️ Technology Stack
- **Backend**: Node.js, Express, SQLite3 (Atomic Persistence), Telegraf (Telegram Bot).
- **Frontend**: Vanilla JS (Modern ES6+), CSS3 (Glassmorphism, High-FPS Animations).
- **AI**: Google Generative AI (Gemini Flash).

## 📦 Getting Started

1. **Install Dependencies**:
   ```bash
   cd backend
   npm install
   ```

2. **Configuration**:
   Copy `.env.example` to `.env` and fill in your:
   - `TELEGRAM_BOT_TOKEN`
   - `GEMINI_API_KEY`

3. **Run**:
   ```bash
   npm run dev
   ```

---
*Developed with ❤️ for the Taxi Simulator Community.*
