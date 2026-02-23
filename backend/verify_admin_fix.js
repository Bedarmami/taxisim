
async function verify() {
    const adminPassword = 'admin123';
    const baseUrl = 'http://localhost:3000';

    try {
        console.log('--- Verifying /api/admin/activities ---');
        const actRes = await fetch(`${baseUrl}/api/admin/activities`, {
            headers: { 'x-admin-password': adminPassword }
        });
        const activities = await actRes.json();
        console.log(`Activities found: ${activities.length}`);
        if (activities.length > 0) {
            console.log('Sample activity:', activities[0]);
        }

        console.log('\n--- Verifying /api/admin/cars ---');
        const carRes = await fetch(`${baseUrl}/api/admin/cars`, {
            headers: { 'x-admin-password': adminPassword }
        });
        const cars = await carRes.json();
        console.log(`Cars found: ${cars.length}`);
        if (cars.length > 0) {
            console.log('Sample car:', cars[0]);
        }

        console.log('\n--- Verifying /api/admin/analytics ---');
        const anaRes = await fetch(`${baseUrl}/api/admin/analytics`, {
            headers: { 'x-admin-password': adminPassword }
        });
        const analytics = await anaRes.json();
        console.log('Analytics keys:', Object.keys(analytics));
        console.log('DAU:', analytics.dau);
        console.log('District Popularity:', analytics.districtPopularity ? 'PRESENT' : 'MISSING');

    } catch (e) {
        console.error('Verification failed:', e.message);
    }
}

verify();
