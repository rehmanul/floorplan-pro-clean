const http = require('http');
const https = require('https');

if (process.argv.length < 3) {
    console.error('Usage: node run_automation_for_urn.js <urn>');
    process.exit(2);
}

const urn = process.argv[2];
const body = JSON.stringify({});
const encoded = encodeURIComponent(urn);
const options = {
    method: 'POST',
    hostname: 'localhost',
    port: 3001,
    path: `/api/jobs/${encoded}/automate`,
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
    },
    timeout: 1000 * 60 * 20 // 20 minutes
};

console.log('Posting automate request for urn:', urn);
const req = http.request(options, (res) => {
    console.log('Status code:', res.statusCode);
    res.setEncoding('utf8');
    let raw = '';
    res.on('data', (chunk) => {
        process.stdout.write(chunk);
        raw += chunk;
    });
    res.on('end', () => {
        console.log('\n--- response end ---');
        try {
            const parsed = JSON.parse(raw);
            console.log('Result:', JSON.stringify(parsed, null, 2));
        } catch (e) {
            console.log('Non-JSON response or partial output.');
        }
    });
});

req.on('timeout', () => {
    console.error('Request timed out');
    req.abort();
});
req.on('error', (err) => {
    console.error('Request error:', err && err.message ? err.message : err);
});

req.write(body);
req.end();
