const sgMail = require('@sendgrid/mail');
require('dotenv').config();

async function sendTestMail() {
    try {
        console.log('📧 Setting up SendGrid test...');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);

        const testMailOptions = {
            from: process.env.SENDGRID_FROM_EMAIL || 'bilgi@kapkazan.com',
            to: 'hakan-aydin@live.com',
            subject: '📧 SendGrid Test Mail - kapkazan System ✅',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
                        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                        .header { text-align: center; margin-bottom: 30px; color: #4CAF50; }
                        .test-info { background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4CAF50; }
                        .status { color: #2d5016; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🍽️ kapkazan SendGrid Test</h1>
                            <h2>✅ Email System Working!</h2>
                        </div>

                        <div class="test-info">
                            <h3>📊 Test Details:</h3>
                            <p><strong>📤 From:</strong> ${process.env.SENDGRID_FROM_EMAIL || 'bilgi@kapkazan.com'}</p>
                            <p><strong>📬 To:</strong> hakan-aydin@live.com</p>
                            <p><strong>🕐 Time:</strong> ${new Date().toLocaleString('tr-TR')}</p>
                            <p><strong>🌐 System:</strong> SendGrid API</p>
                            <p class="status">✅ STATUS: WORKING PERFECTLY!</p>
                        </div>

                        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-top: 20px;">
                            <h3>🔧 System Info:</h3>
                            <ul>
                                <li>✅ SendGrid API aktif</li>
                                <li>✅ Email template rendering çalışıyor</li>
                                <li>✅ Restaurant approval emails hazır</li>
                                <li>✅ Admin.js entegrasyonu tamamlandı</li>
                                <li>✅ Credential system düzeltildi</li>
                            </ul>
                        </div>

                        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                            <p style="color: #666; font-size: 14px;">
                                Bu test maili SendGrid API üzerinden gönderilmiştir.<br>
                                🚀 kapkazan Email System - Ready for Production!
                            </p>
                            <p style="color: #4CAF50; font-weight: bold;">🎉 Test Successful!</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        console.log('📤 Sending test email to hakan-aydin@live.com...');
        const result = await sgMail.send(testMailOptions);
        console.log('✅ Test email sent successfully!');
        console.log('📨 Message ID:', result[0].headers['x-message-id']);
        console.log('🎉 SendGrid test completed successfully!');

    } catch (error) {
        console.error('❌ SendGrid test failed:', error.message);
        if (error.response) {
            console.error('Response body:', error.response.body);
        }
        process.exit(1);
    }
}

console.log('🧪 kapkazan - SendGrid Test Mail Script');
console.log('📧 Sending test email to hakan-aydin@live.com');
console.log('');

sendTestMail();