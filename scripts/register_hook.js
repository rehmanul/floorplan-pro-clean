#!/usr/bin/env node
// Script to register APS Webhooks. Dry-run by default; pass --live to perform network calls.
// Supports two modes: call local server register endpoint (serverUrl) or call APS directly (requires APS_CLIENT_ID & APS_CLIENT_SECRET env vars).

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function parseArgs() {
    const args = {};
    process.argv.slice(2).forEach(a => {
        if (a.startsWith('--')) {
            const [k, v] = a.slice(2).split('=');
            args[k] = v === undefined ? true : v;
        }
    });
    return args;
}

function generateSecret(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
}

async function getApsToken(clientId, clientSecret) {
    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('grant_type', 'client_credentials');
    params.append('scope', 'data:read data:create');

    const resp = await axios.post('https://developer.api.autodesk.com/authentication/v2/token', params, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    return resp.data.access_token;
}

async function createHookOnAps(token, system, event, callbackUrl, scope) {
    const url = `https://developer.api.autodesk.com/webhooks/v1/systems/${system}/events/${event}/hooks`;
    return axios.post(url, { callbackUrl, scope }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
}

async function main() {
    const args = parseArgs();

    const serverUrl = args.serverUrl || process.env.SERVER_URL || null;
    const callbackUrl = args.callbackUrl || process.env.CALLBACK_URL;
    const system = args.system || process.env.WEBHOOK_SYSTEM || 'derivative';
    const event = args.event || process.env.WEBHOOK_EVENT || 'extraction.finished';
    const secretArg = args.secret || process.env.WEBHOOK_SECRET || null;
    const scopeArg = args.scope || process.env.WEBHOOK_SCOPE || null; // if string expects JSON
    const live = args.live || false;

    if (!callbackUrl) {
        console.error('Error: callbackUrl is required. Provide via --callbackUrl=... or env CALLBACK_URL');
        process.exit(1);
    }

    let scope = {};
    if (scopeArg) {
        try { scope = JSON.parse(scopeArg); } catch (e) { console.warn('Could not parse scope JSON, using empty scope'); scope = {}; }
    }

    const secret = secretArg || generateSecret(32);

    const dry = !live;

    console.log('Register Webhook - parameters:');
    console.log({ serverUrl, callbackUrl, system, event, scope, secret: secret.slice(0, 8) + '... (hidden)', dry });

    if (serverUrl) {
        const registerUrl = serverUrl.replace(/\/$/, '') + '/api/aps/webhooks/register';
        const payload = { system, event, callbackUrl, scope, secret };
        console.log('\nPlan: call your server register endpoint at', registerUrl);
        if (dry) {
            console.log('\nDry-run mode. To execute against your server, re-run with --live.');
            console.log('Example curl (PowerShell friendly):');
            console.log(`curl -X POST -H "Content-Type: application/json" -d '${JSON.stringify(payload)}' ${registerUrl}`);
            process.exit(0);
        }

        try {
            const resp = await axios.post(registerUrl, payload, { headers: { 'Content-Type': 'application/json' } });
            console.log('Server register response:', resp.status);
            console.log(JSON.stringify(resp.data, null, 2));
            process.exit(0);
        } catch (err) {
            console.error('Failed to register via server:', err.response?.data || err.message);
            process.exit(2);
        }
    }

    // Direct APS registration path
    const clientId = process.env.APS_CLIENT_ID;
    const clientSecret = process.env.APS_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        console.log('\nNo serverUrl provided and APS_CLIENT_ID/APS_CLIENT_SECRET not found in env.');
        console.log('This script can still produce the exact commands to run manually.');
        console.log('Dry-run output:');
        console.log('\n1) Generated secret (store securely):', secret);
        console.log('\n2) APS create-hook curl (requires token):');
        console.log('\n# Get token (curl)');
        console.log('curl -X POST https://developer.api.autodesk.com/authentication/v2/token -H "Content-Type: application/x-www-form-urlencoded" -d "client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&grant_type=client_credentials&scope=data:read data:create"');
        console.log('\n# Use returned access_token to create hook');
        console.log(`curl -X POST https://developer.api.autodesk.com/webhooks/v1/systems/${system}/events/${event}/hooks -H "Authorization: Bearer <ACCESS_TOKEN>" -H "Content-Type: application/json" -d '${JSON.stringify({ callbackUrl, scope })}'`);
        console.log('\nAfter creation, set APS_WEBHOOK_SECRET to the generated secret in your server to verify incoming callbacks.');
        process.exit(0);
    }

    if (dry) {
        console.log('\nDry-run: will not call APS. Re-run with --live to perform live registration.');
        console.log('Generated secret (store securely):', secret);
        process.exit(0);
    }

    try {
        console.log('Obtaining APS token...');
        const token = await getApsToken(clientId, clientSecret);
        console.log('Token acquired. Creating hook on APS...');
        const createResp = await createHookOnAps(token, system, event, callbackUrl, scope);
        console.log('APS create response status:', createResp.status);
        console.log('Location:', createResp.headers['location'] || '(none)');

        // persist locally to scripts/webhooks.json for convenience
        const storeFile = path.join(__dirname, 'webhooks.json');
        let store = { hooks: [] };
        try {
            if (fs.existsSync(storeFile)) store = JSON.parse(fs.readFileSync(storeFile, 'utf8') || '{}');
        } catch (e) { }
        const entry = { id: createResp.headers['location'] || `${system}:${event}:${Date.now()}`, system, event, callbackUrl, scope, secret, createdAt: new Date().toISOString(), location: createResp.headers['location'] || null };
        store.hooks = store.hooks || [];
        store.hooks.push(entry);
        fs.writeFileSync(storeFile, JSON.stringify(store, null, 2), 'utf8');

        console.log('\nHook created and saved to', storeFile);
        console.log('Remember to set APS_WEBHOOK_SECRET to the generated secret in your server environment to verify callbacks');
        console.log('Secret:', secret);
        process.exit(0);
    } catch (err) {
        console.error('APS registration failed:', err.response?.data || err.message || err);
        process.exit(3);
    }
}

main();
