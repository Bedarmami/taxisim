const http = require('http');

const data = JSON.stringify({
    telegramId: '345194229',
    rewardIndex: 0,
    choice: 'garage'
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/auction/claim',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

console.log('📡 Sending claim request...');

const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        console.log('Response Status:', res.statusCode);
        console.log('Response Body:', body);
        try {
            const parsed = JSON.parse(body);
            if (parsed.success) console.log('✅ Claim successful!');
            else console.error('❌ Claim failed:', parsed.error);
        } catch (e) {
            console.error('Failed to parse response');
        }
    });
});

req.on('error', (e) => {
    console.error('Request error:', e);
});

req.write(data);
req.end();
