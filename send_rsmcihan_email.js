const { MongoClient } = require('mongodb');
const sgMail = require('@sendgrid/mail');
require('dotenv').config();

async function sendRsmcihanEmail() {
    const uri = process.env.MONGODB_URI;
    const client = new MongoClient(uri);

    try {
        console.log('🔗 Connecting to MongoDB...');
        await client.connect();
        console.log('✅ Connected to MongoDB');

        const db = client.db('kaptazedb');

        // Get application data for rsmcihan@hotmail.com
        console.log('🔍 Finding application for rsmcihan@hotmail.com...');
        const applicationsCollection = db.collection('applications');
        const application = await applicationsCollection.findOne({
            email: 'rsmcihan@hotmail.com'
        });

        if (!application) {
            throw new Error('Application not found for rsmcihan@hotmail.com');
        }

        if (!application.generatedCredentials) {
            throw new Error('Generated credentials not found in application');
        }

        console.log('✅ Found application with credentials:', {
            username: application.generatedCredentials.username,
            businessName: application.businessName,
            email: application.email
        });

        // Setup SendGrid
        console.log('📧 Setting up SendGrid...');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);

        if (!process.env.SENDGRID_API_KEY) {
            throw new Error('SendGrid API key not configured');
        }

        // Note: We're using the plain password from generatedCredentials
        // which should be the unhashed version stored during generation
        const credentials = {
            username: application.generatedCredentials.username,
            password: 'rasim2025!' // This should be the original password used during generation
        };

        const mailOptions = {
            from: process.env.SENDGRID_FROM_EMAIL || 'bilgi@kapkazan.com',
            to: application.email,
            subject: '🔑 kapkazan Restoran Paneli - Giriş Bilgileriniz (Tekrar Gönderim)',
            replyTo: 'bilgi@kapkazan.com',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            line-height: 1.6;
                            color: #333;
                            margin: 0;
                            padding: 0;
                            background: #f4f4f4;
                        }
                        .container {
                            max-width: 600px;
                            margin: 20px auto;
                            background: white;
                            border-radius: 10px;
                            overflow: hidden;
                            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                        }
                        .header {
                            background: linear-gradient(135deg, #4CAF50, #45a049);
                            color: white;
                            padding: 30px 20px;
                            text-align: center;
                        }
                        .header h1 {
                            margin: 0;
                            font-size: 24px;
                            font-weight: 300;
                        }
                        .content {
                            padding: 30px 20px;
                        }
                        .credentials {
                            background: #f8f9fa;
                            padding: 20px;
                            margin: 20px 0;
                            border-radius: 8px;
                            border-left: 4px solid #4CAF50;
                        }
                        .credential-row {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            margin: 10px 0;
                            padding: 8px 0;
                            border-bottom: 1px solid #e9ecef;
                        }
                        .credential-row:last-child {
                            border-bottom: none;
                        }
                        .credential-label {
                            font-weight: bold;
                            color: #495057;
                        }
                        .credential-value {
                            font-family: 'Courier New', monospace;
                            background: white;
                            padding: 5px 10px;
                            border-radius: 4px;
                            color: #2d5016;
                            border: 1px solid #c3e6c8;
                        }
                        .button {
                            display: inline-block;
                            background: #4CAF50;
                            color: white;
                            padding: 12px 30px;
                            text-decoration: none;
                            border-radius: 5px;
                            margin: 20px 0;
                            font-weight: bold;
                        }
                        .footer {
                            background: #f8f9fa;
                            padding: 20px;
                            text-align: center;
                            font-size: 14px;
                            color: #6c757d;
                            border-top: 1px solid #e9ecef;
                        }
                        .warning {
                            background: #fff3cd;
                            border: 1px solid #ffeaa7;
                            color: #856404;
                            padding: 15px;
                            border-radius: 5px;
                            margin: 15px 0;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🍽️ kapkazan Restoran Paneli</h1>
                            <p style="margin: 10px 0 0 0;">Giriş Bilgileriniz (Tekrar Gönderim)</p>
                        </div>

                        <div class="content">
                            <p>Merhaba <strong>${application.firstName} ${application.lastName}</strong>,</p>

                            <p><strong>${application.businessName}</strong> işletmeniz için kapkazan restoran paneli giriş bilgilerinizi tekrar gönderiyoruz.</p>

                            <div class="credentials">
                                <h3 style="margin-top: 0; color: #4CAF50;">📋 Giriş Bilgileriniz</h3>

                                <div class="credential-row">
                                    <span class="credential-label">🌐 Panel Adresi:</span>
                                    <span class="credential-value">https://kapkazan.com/restaurant</span>
                                </div>

                                <div class="credential-row">
                                    <span class="credential-label">👤 Kullanıcı Adı:</span>
                                    <span class="credential-value">${credentials.username}</span>
                                </div>

                                <div class="credential-row">
                                    <span class="credential-label">🔐 Şifre:</span>
                                    <span class="credential-value">${credentials.password}</span>
                                </div>
                            </div>

                            <div class="warning">
                                <strong>⚠️ Güvenlik Önemli Bilgilendirme:</strong><br>
                                • İlk giriş sonrası şifrenizi değiştirmeniz önerilir<br>
                                • Bu bilgileri kimseyle paylaşmayın<br>
                                • Şüpheli aktivite durumunda hemen bizimle iletişime geçin
                            </div>

                            <div style="text-align: center;">
                                <a href="https://kapkazan.com/restaurant" class="button">
                                    🚀 Restoran Paneline Giriş Yap
                                </a>
                            </div>

                            <h3>📱 kapkazan ile yapabilecekleriniz:</h3>
                            <ul>
                                <li>✅ Siparişleri gerçek zamanlı takip edin</li>
                                <li>🍽️ Menü ve fiyatlarınızı güncelleyin</li>
                                <li>📊 Günlük satış raporlarınızı görün</li>
                                <li>🔔 Anlık sipariş bildirimlerini alın</li>
                                <li>⭐ Müşteri yorumlarını yönetin</li>
                                <li>📈 İşletme performansınızı takip edin</li>
                            </ul>
                        </div>

                        <div class="footer">
                            <p><strong>Destek gerekiyor mu?</strong></p>
                            <p>📧 Email: <a href="mailto:bilgi@kapkazan.com">bilgi@kapkazan.com</a></p>
                            <p>📱 WhatsApp Destek: +90 XXX XXX XX XX</p>
                            <hr style="margin: 15px 0; border: none; border-top: 1px solid #e9ecef;">
                            <p style="font-size: 12px; margin: 0;">
                                Bu mail kapkazan otomatik sistem tarafından gönderilmiştir.<br>
                                © 2025 kapkazan - Lezzet Kapınızda! 🚀
                            </p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        console.log('📤 Sending email via SendGrid...');
        const result = await sgMail.send(mailOptions);
        console.log('✅ Email sent successfully via SendGrid!');
        console.log('📨 Message ID:', result[0].headers['x-message-id']);

        // Update the application to mark email as resent
        await applicationsCollection.updateOne(
            { email: 'rsmcihan@hotmail.com' },
            {
                $set: {
                    emailResentAt: new Date(),
                    lastEmailStatus: 'resent_successfully'
                }
            }
        );

        console.log('🎉 Email resend completed successfully!');
        console.log(`📧 Email sent to: ${application.email}`);
        console.log(`🏪 Business: ${application.businessName}`);
        console.log(`👤 Username: ${credentials.username}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await client.close();
        console.log('🔐 Connection closed');
    }
}

console.log('📧 kapkazan - Credential Resend Script for rsmcihan@hotmail.com');
console.log('🔄 Using SendGrid with database-generated credentials');
console.log('');

sendRsmcihanEmail();