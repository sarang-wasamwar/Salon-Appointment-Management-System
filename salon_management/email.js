const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

transporter.verify((error, success) => {
    if (error) {
        console.log('Email configuration error:');
        console.error('   Error:', error.message);
    } else {
        console.log('Email server is ready');
        console.log('   Using account:', process.env.EMAIL_USER);
    }
});

module.exports = transporter;