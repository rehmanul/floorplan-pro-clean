const crypto = require('crypto');

function genHex() {
    return crypto.randomBytes(32).toString('hex');
}

function genBase64() {
    return crypto.randomBytes(32).toString('base64');
}

if (require.main === module) {
    console.log('# 32-byte MASTER_KEY (hex)');
    console.log(genHex());
    console.log('# 32-byte MASTER_KEY (base64)');
    console.log(genBase64());
}

module.exports = { genHex, genBase64 };
