const { execFile, spawn } = require('child_process');
const path = require('path');
const http = require('http');

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function waitForHealth(url, timeout = 10000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        (function poll() {
            const req = http.get(url, res => {
                // consume response to free socket
                res.on('data', () => { });
                res.on('end', () => { });
                if (res.statusCode && res.statusCode < 500) return resolve(true);
                if (Date.now() - start > timeout) return reject(new Error('health check timeout'));
                setTimeout(poll, 200);
            });
            req.on('error', () => {
                if (Date.now() - start > timeout) return reject(new Error('health check timeout'));
                setTimeout(poll, 200);
            });
            // ensure request doesn't keep socket open on Node versions that keep it alive
            req.setTimeout(2000, () => { try { req.abort(); } catch (e) { } });
        })();
    });
}

describe('integration: debug placements', () => {
    test('server health endpoint responds', async () => {
        const root = path.join(__dirname, '..');
        const serverProc = spawn('node', ['server.js'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
        try {
            await waitForHealth('http://localhost:3001/health', 15000);
            const j = await fetchJson('http://localhost:3001/health');
            expect(j).toHaveProperty('status');
            expect(j.status).toBe('ok');
        } finally {
            try { serverProc.kill(); } catch (e) { }
            try { if (!serverProc.killed) serverProc.kill('SIGKILL'); } catch (e) { }
        }
    }, 30000);
});
