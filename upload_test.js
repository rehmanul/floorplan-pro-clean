const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

async function uploadFile() {
    const filePath = path.join(__dirname, 'uploads', 'anteen.dwg');
    const url = 'http://localhost:3001/api/jobs';

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    try {
        const response = await axios.post(url, form, {
            headers: {
                ...form.getHeaders()
            }
        });
        console.log('Upload response:', response.data);
    } catch (error) {
        console.error('Upload failed:', error.response ? error.response.data : error.message);
    }
}

uploadFile();
