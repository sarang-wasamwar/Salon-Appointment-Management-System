require('dotenv').config();
const transporter = require('./email');

async function testEmail() {
    try {
        const info = await transporter.sendMail({
            from: `"Test" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER,
            subject: "Test Email",
            text: "If you receive this, email is working!"
        });
        console.log("Email sent successfully!");
        console.log("Message ID:", info.messageId);
    } catch (error) {
        console.log("Email failed:");
        console.error(error);
    }
}

testEmail();