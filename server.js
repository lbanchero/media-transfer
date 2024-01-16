const express = require('express');
const multer = require('multer');
const fs = require('fs');
var tus = require('tus-js-client');

const app = express();
const port = 3000;

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now());
    }
});

const upload = multer({ storage: storage });

app.post('/upload-video', upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No video file uploaded.');
    }
    const accountId = req.headers['provider-account-id']
    const apiKey = req.headers['provider-account-key']

    uploadVideoToCloudflareTus(req.file, accountId, apiKey).then((url) => {
        return res.status(200).send(url);
    }).catch((error) => {
        console.error('Error uploading video:', error);
        return res.status(500).send('Error uploading video.');
    });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

const uploadVideoToCloudflareTus = async (file, accountId, apiKey) => {
    return new Promise((resolve, reject) => {
        var fileStream = fs.createReadStream(file.path);
        var size = fs.statSync(file.path).size;
        var mediaId = ''; // Variable to store the Media ID

        var options = {
            endpoint: `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`,
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
            chunkSize: 50 * 1024 * 1024, // 50MB chunk size.
            retryDelays: [0, 3000, 5000, 10000, 20000],
            metadata: {
                filename: file.filename,
                filetype: file.mimeType,
                defaulttimestamppct: 0.5,
            },
            uploadSize: size,
            onError: function (error) {
                console.error('Upload error:', error);
                reject(error);
            },
            onProgress: function (bytesUploaded, bytesTotal) {
                var percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2);
                console.log(`Upload Progress: ${percentage}%`);
            },
            onSuccess: function () {
                console.log('Upload finished');
                if (mediaId) {
                    const url = `https://customer-khy2yp67fj1slxed.cloudflarestream.com/${mediaId}/watch`;
                    resolve(url);
                } else {
                    reject('Upload succeeded but no Media ID was returned.');
                }
            },
            onAfterResponse: function (req, res) {
                return new Promise(resolveInner => {
                    mediaId = res.getHeader('stream-media-id');
                    resolveInner();
                });
            },
        };

        var upload = new tus.Upload(fileStream, options);
        upload.start();
    });
}