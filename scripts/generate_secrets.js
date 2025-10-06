const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function generateWebhookSecret() {
    return crypto.randomBytes(32).toString('hex');
}

function generateMasterKey() {
    // 32 bytes hex = 64 hex chars
    return crypto.randomBytes(32).toString('hex');
}

const out = {
    APS_WEBHOOK_SECRET: generateWebhookSecret(),
    MASTER_KEY: generateMasterKey()
};

const file = path.join(__dirname, '..', '.env.example');
let content = '';
if (fs.existsSync(file)) content = fs.readFileSync(file, 'utf8');
content += `\n# Generated secrets (DO NOT COMMIT)\n`;
content += `APS_WEBHOOK_SECRET=${out.APS_WEBHOOK_SECRET}\n`;
content += `MASTER_KEY=${out.MASTER_KEY}\n`;
fs.writeFileSync(file, content, { encoding: 'utf8' });
console.log('Generated secrets (written to .env.example).');
console.log(out);
