const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function upload() {
    const filePath = 'uploads/residential floor plan for test.dxf';
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    try {
        const res = await axios.post('http://localhost:3001/api/jobs', form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        console.log('Upload response:', res.data);
    } catch (e) {
        console.error('Upload failed:', e && e.response ? (e.response.data || e.response.statusText || e.response.status) : e.message);
        if (e.response && e.response.data) console.error('Response details:', e.response.data);
        process.exit(1);
    }
}

upload();
