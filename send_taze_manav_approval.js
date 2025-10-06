const { MongoClient } = require('mongodb');
const sgMail = require('@sendgrid/mail');
require('dotenv').config();

async function sendTazeManavApproval() {
    const uri = process.env.MONGODB_URI;
    const client = new MongoClient(uri);

    try {
        console.log('🔗 Connecting to MongoDB...');
        await client.connect();
        console.log('✅ Connected to MongoDB');

        const db = client.db('kaptazedb');
        const applicationsCollection = db.collection('applications');

        // Find Taze Manav application
        const applicationId = 'APP_1758896086941_cfwqgi5iq';
        console.log(`🔍 Searching for Taze Manav application: ${applicationId}`);

        const application = await applicationsCollection.findOne({
            applicationId: applicationId
        });

        if (!application) {
            throw new Error(`Taze Manav application not found: ${applicationId}`);
        }

        console.log('✅ Found Taze Manav application:', {
            name: `${application.firstName} ${application.lastName}`,
            email: application.email,
            business: application.businessName,
            status: application.status
        });

        // Check if has generated credentials
        if (!application.generatedCredentials || !application.generatedCredentials.username) {
            throw new Error('No generated credentials found for Taze Manav application');
        }

        // Generate new password and update database
        const plainPassword = generatePassword();
        console.log(`🔐 Generated new password for Taze Manav: ${plainPassword}`);

        await applicationsCollection.updateOne(
            { applicationId: applicationId },
            {
                $set: {
                    'generatedCredentials.password': plainPassword,
                    'generatedCredentials.updatedAt': new Date(),
                    'tazeManavFixApplied': true
                }
            }
        );
        console.log('✅ Updated Taze Manav application with plain password');

        const credentials = {
            username: application.generatedCredentials.username,
            password: plainPassword
        };

        // Setup SendGrid
        console.log('📧 Setting up SendGrid for Taze Manav...');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);

        const mailOptions = {
            from: process.env.SENDGRID_FROM_EMAIL || 'bilgi@kapkazan.com',
            to: application.email,
            subject: '🎉 kapkazan Başvurunuz Onaylandı - Giriş Bilgileriniz',
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
                            font-weight: bold;
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
                        .taze-special {
                            background: linear-gradient(135deg, #4CAF50, #81C784);
                            color: white;
                            padding: 15px;
                            border-radius: 8px;
                            margin: 20px 0;
                            text-align: center;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🥬 kapkazan Restoran Paneli</h1>
                            <p>Taze Manav Başvurunuz Onaylandı!</p>
                        </div>

                        <div class="content">
                            <div class="taze-special">
                                <h2 style="margin: 0;">🥬 Hoş Geldiniz Taze Manav! 🥬</h2>
                                <p style="margin: 10px 0 0 0;">kapkazan ailesine katıldığınız için teşekkürler!</p>
                            </div>

                            <p>Merhaba <strong>${application.firstName} ${application.lastName}</strong>,</p>

                            <p><strong>${application.businessName}</strong> işletmenizin kapkazan platformuna başvurusu onaylanmıştır! 🎉</p>

                            <div class="credentials">
                                <h3 style="margin-top: 0; color: #4CAF50;">🔑 Giriş Bilgileriniz</h3>

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

                            <div style="text-align: center;">
                                <a href="https://kapkazan.com/restaurant" class="button">
                                    🚀 Restoran Paneline Giriş Yap
                                </a>
                            </div>

                            <h3>🥬 Taze Manav ile kapkazan'de yapabilecekleriniz:</h3>
                            <ul>
                                <li>✅ Taze sebze-meyve siparişlerini gerçek zamanlı takip edin</li>
                                <li>🥕 Günlük taze ürün menünüzü güncelleyin</li>
                                <li>📊 Günlük satış raporlarınızı görün</li>
                                <li>🔔 Anlık sipariş bildirimlerini alın</li>
                                <li>⭐ Müşteri yorumlarını yönetin</li>
                                <li>📈 Manav performansınızı takip edin</li>
                                <li>🚚 Hızlı teslimat sistemiyle müşteri memnuniyeti</li>
                            </ul>

                            <div style="background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 15px; border-radius: 5px; margin: 15px 0;">
                                <strong>⚠️ Güvenlik Notları:</strong><br>
                                • İlk girişten sonra şifrenizi değiştirmeniz önerilir<br>
                                • Giriş bilgilerinizi kimseyle paylaşmayın<br>
                                • Bu mail manuel olarak gönderilmiştir - email sistemi düzeltildi
                            </div>
                        </div>

                        <div style="background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666;">
                            <p><strong>🥬 Taze Manav Desteği 🥬</strong></p>
                            <p>📧 Email: bilgi@kapkazan.com</p>
                            <p>© 2025 kapkazan - Taze Lezzet Kapınızda! 🚀</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        console.log('📤 Sending Taze Manav approval email via SendGrid...');
        const result = await sgMail.send(mailOptions);
        console.log('✅ Taze Manav approval email sent successfully!');
        console.log('📨 Message ID:', result[0].headers['x-message-id']);

        // Update application with email sent info
        await applicationsCollection.updateOne(
            { applicationId: applicationId },
            {
                $set: {
                    emailSent: true,
                    emailSentAt: new Date(),
                    emailMessageId: result[0].headers['x-message-id'],
                    lastEmailStatus: 'sent_manually_taze_manav_fix'
                }
            }
        );

        console.log('🎉 Taze Manav manual approval email completed successfully!');
        console.log(`📧 Email: ${application.email}`);
        console.log(`🥬 Business: ${application.businessName}`);
        console.log(`👤 Username: ${credentials.username}`);
        console.log(`🔐 Password: ${credentials.password}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await client.close();
        console.log('🔐 Connection closed');
    }
}

function generatePassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

console.log('🥬 kapkazan - Taze Manav Manual Approval Email Sender');
console.log('📧 Sending approval email to: parkobolte@necub.com');
console.log('🔍 Application ID: APP_1758896086941_cfwqgi5iq');
console.log('');

sendTazeManavApproval();