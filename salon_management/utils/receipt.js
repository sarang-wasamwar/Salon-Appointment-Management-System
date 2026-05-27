const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const receiptsDir = path.join(__dirname, '../public/receipts');
if (!fs.existsSync(receiptsDir)) {
    fs.mkdirSync(receiptsDir, { recursive: true });
}

function generateReceipt(paymentData, appointmentData, customerData, serviceData) {
    return new Promise((resolve, reject) => {
        try {
            const fileName = `receipt_${paymentData.payment_id}_${Date.now()}.pdf`;
            const filePath = path.join(receiptsDir, fileName);
            const relativePath = `/receipts/${fileName}`;
            
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            const stream = fs.createWriteStream(filePath);
            
            doc.pipe(stream);
            
            doc.fontSize(24)
               .font('Helvetica-Bold')
               .fillColor('#ff7a00')
               .text('SalonSnap', { align: 'center' });
            
            doc.fontSize(14)
               .font('Helvetica')
               .fillColor('#7a4a2e')
               .text('Premium Beauty & Wellness Services', { align: 'center' });
            
            doc.moveDown();
            
            doc.fontSize(18)
               .font('Helvetica-Bold')
               .fillColor('#ff7a00')
               .text('PAYMENT RECEIPT', { align: 'center' });
            
            doc.moveDown();
            
            doc.strokeColor('#ffe2cc')
               .lineWidth(1)
               .moveTo(50, doc.y)
               .lineTo(550, doc.y)
               .stroke();
            
            doc.moveDown(0.5);
            
            doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#666');
            
            doc.text(`Receipt No: ${paymentData.payment_id}`, 50, doc.y);
            doc.text(`Date: ${new Date(paymentData.payment_date).toLocaleString()}`, 400, doc.y - 20);
            
            doc.moveDown();
            
            doc.fontSize(12)
               .font('Helvetica-Bold')
               .fillColor('#ff7a00')
               .text('CUSTOMER INFORMATION', { underline: true });
            
            doc.moveDown(0.5);
            
            doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#7a4a2e');
            
            doc.text(`Name: ${customerData.full_name}`, 50, doc.y);
            doc.text(`Email: ${customerData.email}`, 50, doc.y + 15);
            doc.text(`Phone: ${customerData.phone}`, 50, doc.y + 30);
            
            doc.moveDown(3);
            
            doc.fontSize(12)
               .font('Helvetica-Bold')
               .fillColor('#ff7a00')
               .text('APPOINTMENT DETAILS', { underline: true });
            
            doc.moveDown(0.5);
            
            doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#7a4a2e');
            
            doc.text(`Service: ${serviceData.service_name}`, 50, doc.y);
            doc.text(`Date: ${appointmentData.appointment_date}`, 50, doc.y + 15);
            doc.text(`Time: ${appointmentData.appointment_time}`, 50, doc.y + 30);
            doc.text(`Duration: ${serviceData.duration_minutes} minutes`, 50, doc.y + 45);
            if (appointmentData.staff_name) {
                doc.text(`Stylist: ${appointmentData.staff_name}`, 50, doc.y + 60);
            }
            
            doc.moveDown(4);
            
            doc.fontSize(12)
               .font('Helvetica-Bold')
               .fillColor('#ff7a00')
               .text('PAYMENT DETAILS', { underline: true });
            
            doc.moveDown(0.5);
            
            const tableTop = doc.y;
            const startX = 50;
            const col1 = 50;
            const col2 = 300;
            const col3 = 450;
            
            doc.fontSize(10)
               .font('Helvetica-Bold')
               .fillColor('#7a4a2e');
            
            doc.text('Description', col1, tableTop);
            doc.text('Amount', col3, tableTop);
            
            doc.moveDown(0.5);
            doc.strokeColor('#ffe2cc')
               .lineWidth(0.5)
               .moveTo(startX, doc.y)
               .lineTo(550, doc.y)
               .stroke();
            
            doc.moveDown(0.5);
            
            doc.font('Helvetica')
               .fillColor('#7a4a2e');
            
            doc.text(serviceData.service_name, col1, doc.y);
            doc.text(`₹${parseFloat(paymentData.amount).toFixed(2)}`, col3, doc.y);
            
            doc.moveDown(1);
            
            doc.font('Helvetica-Bold')
               .fillColor('#ff7a00');
            
            doc.text('Total Amount', col2, doc.y);
            doc.text(`₹${parseFloat(paymentData.amount).toFixed(2)}`, col3, doc.y);
            
            doc.moveDown(2);
            
            doc.fontSize(10)
               .font('Helvetica-Bold')
               .fillColor(paymentData.payment_status === 'Completed' ? '#2e7d32' : '#ed6c02');
            
            doc.text(`Payment Status: ${paymentData.payment_status}`, 50, doc.y);
            doc.text(`Payment Method: ${paymentData.payment_method}`, 50, doc.y + 15);
            
            if (paymentData.transaction_id) {
                doc.text(`Transaction ID: ${paymentData.transaction_id}`, 50, doc.y + 30);
            }
            
            doc.moveDown(3);
            
            doc.fontSize(8)
               .font('Helvetica')
               .fillColor('#999');
            
            doc.text('Thank you for choosing SalonSnap!', { align: 'center' });
            doc.text('We look forward to serving you again.', { align: 'center' });
            doc.text('For any queries, contact us at info@salonsnap.com', { align: 'center' });
            
            doc.moveDown(0.5);
            doc.text('This is a computer-generated receipt and does not require a signature.', { align: 'center' });
            
            doc.end();
            
            stream.on('finish', () => {
                resolve({
                    fileName: fileName,
                    filePath: relativePath,
                    fullPath: filePath
                });
            });
            
            stream.on('error', reject);
            
        } catch (error) {
            reject(error);
        }
    });
}

module.exports = { generateReceipt };