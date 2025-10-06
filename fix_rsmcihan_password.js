const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const sgMail = require('@sendgrid/mail');
require('dotenv').config();

// Import User model
const User = require('./models/User');

async function fixRsmcihanPassword() {
    try {
        // Connect to MongoDB
        console.log('🔗 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Set new password
        const newPassword = 'rasim123!';
        console.log(`🔐 Setting new password: ${newPassword}`);

        // Find user by email
        const user = await User.findOne({ email: 'rsmcihan@hotmail.com' });
        if (!user) {
            throw new Error('User not found with email: rsmcihan@hotmail.com');
        }

        console.log(`👤 Found user: ${user.username} (${user.email})`);

        // Update password (User model will auto-hash it via pre-save middleware)
        user.password = newPassword;
        await user.save();

        console.log('✅ Password updated in database successfully!');

        // Send email with new credentials
        console.log('📧 Setting up SendGrid...');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);

        const mailOptions = {
            from: process.env.SENDGRID_FROM_EMAIL || 'bilgi@kapkazan.com',
            to: 'rsmcihan@hotmail.com',
            subject: '🔑 kapkazan - YENİ Şifreniz (Sorun Çözüldü)',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
                        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                        .header { text-align: center; margin-bottom: 30px; color: #4CAF50; }
                        .credentials { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4CAF50; }
                        .credential-item { margin: 10px 0; padding: 10px; background: white; border-radius: 5px; display: flex; justify-content: space-between; }
                        .credential-value { font-family: monospace; font-weight: bold; color: #2d5016; background: #d4edda; padding: 5px 10px; border-radius: 3px; }
                        .button { display: inline-block; background: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
                        .warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 15px; border-radius: 5px; margin: 15px 0; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🍽️ kapkazan Restoran Paneli</h1>
                            <h2>Şifre Sorunu Çözüldü! ✅</h2>
                        </div>

                        <p>Merhaba <strong>Rasim Bey</strong>,</p>

                        <p>Şifre sorununuz çözülmüştür! <strong>Rasim Ev Yemekleri</strong> için yeni giriş bilgileriniz aşağıdadır:</p>

                        <div class="credentials">
                            <h3 style="margin-top: 0;">🔑 YENİ Giriş Bilgileriniz</h3>

                            <div class="credential-item">
                                <span>🌐 Panel Adresi:</span>
                                <span class="credential-value">https://kaptaze.com/restaurant</span>
                            </div>

                            <div class="credential-item">
                                <span>👤 Kullanıcı Adı:</span>
                                <span class="credential-value">${user.username}</span>
                            </div>

                            <div class="credential-item">
                                <span>🔐 YENİ Şifre:</span>
                                <span class="credential-value">${newPassword}</span>
                            </div>
                        </div>

                        <div class="warning">
                            <strong>✅ SORUN ÇÖZÜLDÜ!</strong><br>
                            • Şifreniz artık çalışacak<br>
                            • Giriş yaptıktan sonra güvenlik için şifrenizi değiştirmenizi öneriyoruz<br>
                            • Bu mail teknik destek ekibimiz tarafından gönderilmiştir
                        </div>

                        <div style="text-align: center;">
                            <a href="https://kaptaze.com/restaurant" class="button">
                                🚀 Şimdi Giriş Yap
                            </a>
                        </div>

                        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666;">
                            <p><strong>Destek:</strong></p>
                            <p>📧 Email: bilgi@kapkazan.com</p>
                            <p>Bu sorunu yaşadığınız için özür dileriz. kapkazan Teknik Ekibi</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        console.log('📤 Sending corrected email...');
        const result = await sgMail.send(mailOptions);
        console.log('✅ Email sent successfully!');
        console.log('📨 Message ID:', result[0].headers['x-message-id']);

        console.log('🎉 Password fix completed successfully!');
        console.log(`📧 Email: rsmcihan@hotmail.com`);
        console.log(`👤 Username: ${user.username}`);
        console.log(`🔐 New Password: ${newPassword}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('🔐 Database disconnected');
    }
}

console.log('🛠️ kapkazan - Password Fix Script for rsmcihan@hotmail.com');
console.log('📝 This will update user password and send email with working credentials');
console.log('');

fixRsmcihanPassword();