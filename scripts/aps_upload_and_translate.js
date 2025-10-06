#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const axios = require('axios');

require('dotenv').config();

const APS_BASE_URL = 'https://developer.api.autodesk.com';
const CLIENT_ID = process.env.APS_CLIENT_ID;
const CLIENT_SECRET = process.env.APS_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('APS_CLIENT_ID and APS_CLIENT_SECRET must be set in environment');
    process.exit(2);
}

async function getToken() {
    const params = new URLSearchParams();
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('grant_type', 'client_credentials');
    params.append('scope', 'data:read data:write bucket:create');

    const r = await axios.post(`${APS_BASE_URL}/authentication/v2/token`, params, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    return r.data.access_token;
}

async function uploadFile(token, filePath, fileName) {
    const bucketKey = CLIENT_ID.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 32);
    const objectName = Date.now() + '-' + fileName;

    // create bucket if needed
    try {
        await axios.post(`${APS_BASE_URL}/oss/v2/buckets`, { bucketKey, policyKey: 'transient' }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    } catch (e) {
        if (e.response && e.response.status === 409) { /* exists */ } else throw e;
    }

    // signed upload
    const signed = await axios.get(`${APS_BASE_URL}/oss/v2/buckets/${bucketKey}/objects/${objectName}/signeds3upload`, { headers: { Authorization: `Bearer ${token}` } });
    const fileBuf = fs.readFileSync(filePath);
    await axios.put(signed.data.urls[0], fileBuf, { headers: { 'Content-Type': 'application/octet-stream' } });
    const complete = await axios.post(`${APS_BASE_URL}/oss/v2/buckets/${bucketKey}/objects/${objectName}/signeds3upload`, { uploadKey: signed.data.uploadKey }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    const urn = Buffer.from(complete.data.objectId).toString('base64');
    return urn;
}

async function startTranslation(token, urn) {
    const body = { input: { urn }, output: { formats: [{ type: 'svf', views: ['2d', '3d'] }] } };
    await axios.post(`${APS_BASE_URL}/modelderivative/v2/designdata/job`, body, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
}

async function pollManifest(token, urn, timeoutMs = 5 * 60 * 1000) {
    const start = Date.now();
    while (true) {
        const resp = await axios.get(`${APS_BASE_URL}/modelderivative/v2/designdata/${urn}/manifest`, { headers: { Authorization: `Bearer ${token}` } });
        const status = resp.data.status;
        console.log('Manifest status:', status, resp.data.progress || '');
        if (status === 'success' || status === 'failed' || status === 'failed-translating') return resp.data;
        if (Date.now() - start > timeoutMs) throw new Error('Timeout waiting for manifest');
        await new Promise(r => setTimeout(r, 5000));
    }
}

async function main() {
    const fileArg = process.argv[2] || path.join(__dirname, '..', 'uploads', 'residential floor plan for test.dxf');
    if (!fs.existsSync(fileArg)) {
        console.error('File not found:', fileArg);
        process.exit(2);
    }

    try {
        console.log('Getting token...');
        const token = await getToken();
        console.log('Uploading file to APS...');
        const urn = await uploadFile(token, fileArg, path.basename(fileArg));
        console.log('Uploaded. URN:', urn);
        console.log('Starting translation...');
        await startTranslation(token, urn);
        console.log('Translation job started. Polling manifest...');
        const manifest = await pollManifest(token, urn, 10 * 60 * 1000);
        console.log('Final manifest status:', manifest.status);
    } catch (e) {
        console.error('Error during APS upload/translate:', e.response?.data || e.message || e);
        process.exit(1);
    }
}

main();
