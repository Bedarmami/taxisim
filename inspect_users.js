const db = require('./backend/db');
db.dbReady.then(async () => {
    try {
        const rows = await db.query("PRAGMA table_info(users)");
        console.log('Columns in users:');
        rows.forEach(row => console.log(`- ${row.name} (${row.type})`));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
});
