const axios = require('axios');
(async () => {
    try {
        const adminKey = process.env.ADMIN_API_KEY;
        if (!adminKey) {
            console.error('ADMIN_API_KEY not set. Aborting. This script now calls the admin-only simulate endpoint.');
            process.exit(2);
        }

        const urn = process.env.SIMULATE_URN || 'dXJuOmFkc2sub2JqZWN0czpvcy5vYmplY3Q6Ynpja29meW52ZTJ3NHJwem55bW9vY3VxeGt3ZWwvMTc1OTU2NDM2NDQyNC1yZXNpZGVudGlhbCUyMGZsb29yJTIwcGxhbiUyMGZvciUyMHRlc3QuZHhm';

        const body = {
            urn,
            event: 'translation.finished',
            status: 'success',
            distribution: { '1-3': 10 },
            options: { totalIlots: 8 },
            corridorWidth: 1.6
        };

        const headers = { 'Content-Type': 'application/json', 'x-admin-api-key': adminKey };

        const target = process.env.SIMULATE_TARGET || 'http://127.0.0.1:3001';
        const url = `${target.replace(/\/$/, '')}/api/admin/aps/webhook/simulate`;

        console.log('Posting admin simulate webhook to', url);

        const res = await axios.post(url, body, { headers, timeout: 120000 });
        console.log('Simulate result:', res.data);
    } catch (e) {
        console.error('Simulate failed:', e.message);
        if (e.response) {
            console.error('Response status:', e.response.status);
            try { console.error('Response data:', JSON.stringify(e.response.data)); } catch (err) { console.error('Response data (raw):', e.response.data); }
        }
        process.exit(1);
    }
})();
