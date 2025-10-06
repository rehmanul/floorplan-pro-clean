#!/usr/bin/env node
const path = require('path');
const webhookWorker = require('../lib/webhookWorker');
const server = require('../server');

async function runJob(job) {
    try {
        console.log('Processing job', job.id, job.urn);
        await server.runAutomationForUrn(job.urn, { distribution: { '1-3': 10 }, options: {}, corridorWidth: 1.5, waitForAPS: false, analysisData: null });
        webhookWorker.markDone(job.id);
        console.log('Job done', job.id);
    } catch (e) {
        console.error('Job failed', job.id, e.message || e);
        webhookWorker.markFailed(job.id, e.message || String(e));
    }
}

async function main() {
    const pending = webhookWorker.fetchPending(10);
    for (const job of pending) {
        webhookWorker.markInProgress(job.id);
        await runJob(job);
    }
}

main().catch(e => { console.error(e); process.exit(1); });
