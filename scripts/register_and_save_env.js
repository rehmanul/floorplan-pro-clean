#!/usr/bin/env node
// Register a webhook via the local server and save the returned secret into .env
// Usage examples:
// node scripts/register_and_save_env.js --serverUrl=http://127.0.0.1:3001 --callbackUrl=http://yourhost/api/aps/webhook/callback
// node scripts/register_and_save_env.js --dry (preview only)

const axios = require('axios');
const fs = require('fs');
const path = require('path');

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

function upsertEnv(filePath, kv) {
    let env = {};
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        content.split(/\r?\n/).forEach(line => {
            if (!line || line.trim().startsWith('#')) return;
            const idx = line.indexOf('=');
            if (idx === -1) return;
            const key = line.slice(0, idx).trim();
            const val = line.slice(idx + 1).trim();
            env[key] = val;
        });
    }

    Object.keys(kv).forEach(k => env[k] = kv[k]);

    // Write back
    const out = Object.keys(env).map(k => `${k}=${env[k]}`).join(require('os').EOL) + require('os').EOL;
    fs.writeFileSync(filePath, out, 'utf8');
}

async function main() {
    const args = parseArgs();
    const serverUrl = args.serverUrl || process.env.SERVER_URL || 'http://127.0.0.1:3001';
    const callbackUrl = args.callbackUrl || process.env.CALLBACK_URL || `${serverUrl.replace(/\/$/, '')}/api/aps/webhook/callback`;
    const system = args.system || 'derivative';
    const event = args.event || 'extraction.finished';
    const secret = args.secret || null;
    const scopeArg = args.scope || null;
    const dry = args.dry || false;

    const registerUrl = serverUrl.replace(/\/$/, '') + '/api/aps/webhooks/register';

    const payload = { system, event, callbackUrl, scope: {} };
    if (scopeArg) {
        try { payload.scope = JSON.parse(scopeArg); } catch (e) { console.warn('Could not parse scope, using empty scope'); }
    }
    if (secret) payload.secret = secret;

    console.log('Registering webhook with server:', registerUrl);
    console.log('Payload:', JSON.stringify(payload, null, 2));
    if (dry) {
        console.log('\nDry run: will not contact server. To perform the registration remove --dry.');
        return process.exit(0);
    }

    try {
        const resp = await axios.post(registerUrl, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 20000 });
        if (!resp.data || !resp.data.hook) {
            console.error('Unexpected server response:', resp.status, resp.data);
            process.exit(2);
        }

        const hook = resp.data.hook;
        console.log('Hook registered:', JSON.stringify(hook, null, 2));

        const envFile = path.join(process.cwd(), '.env');
        const newEnv = { APS_WEBHOOK_SECRET: hook.secret };
        upsertEnv(envFile, newEnv);
        console.log('Wrote APS_WEBHOOK_SECRET to', envFile);

        // Optionally also save hook id/location
        const storeFile = path.join(process.cwd(), 'webhooks.json');
        let store = { hooks: [] };
        if (fs.existsSync(storeFile)) {
            try { store = JSON.parse(fs.readFileSync(storeFile, 'utf8') || '{}'); } catch (e) { store = { hooks: [] }; }
        }
        store.hooks = store.hooks || [];
        store.hooks.push({ id: hook.id || hook.location || `${system}:${event}:${Date.now()}`, location: hook.location || null, createdAt: new Date().toISOString(), system, event, callbackUrl });
        fs.writeFileSync(storeFile, JSON.stringify(store, null, 2), 'utf8');
        console.log('Saved hook metadata to', storeFile);

        console.log('\nDone. Remember to restart your server if it reads .env at startup.');
        process.exit(0);
    } catch (err) {
        console.error('Registration failed:', err.response?.data || err.message || err);
        process.exit(3);
    }
}

main();
