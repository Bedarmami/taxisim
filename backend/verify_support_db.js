const db = require('./db');

async function verifySupportDB() {
    try {
        await db.dbReady;
        console.log('✅ DB Ready');

        const tables = await db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='support_messages'");
        if (tables.length > 0) {
            console.log('✅ support_messages table exists');
        } else {
            console.error('❌ support_messages table MISSING');
        }

        const columns = await db.query("PRAGMA table_info(support_messages)");
        console.log('Columns in support_messages:', columns.map(c => c.name).join(', '));

        process.exit(0);
    } catch (e) {
        console.error('Verification failed:', e);
        process.exit(1);
    }
}

verifySupportDB();
