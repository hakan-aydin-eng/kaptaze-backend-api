/**
 * Manual Credential Email Sender
 * Usage: node scripts/sendManualCredentials.js <email> <username> <restaurantName>
 */

require('dotenv').config();
const sgMail = require('@sendgrid/mail');

async function sendCredentialsEmail(email, username, restaurantName, tempPassword = null) {
    try {
        console.log('📧 Preparing to send credentials email via SendGrid...');

        if (!process.env.SENDGRID_API_KEY) {
            throw new Error('SendGrid API key not configured');
        }

        // SendGrid configuration
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);

        // Generate temporary password if not provided
        const password = tempPassword || generateTempPassword();

        const mailOptions = {
            from: process.env.SENDGRID_FROM_EMAIL || 'noreply@kaptaze.com',
            to: email,
            subject: '🔑 KapTaze Giriş Bilgileriniz - Restaurant Panel Access',
            replyTo: 'destek@kaptaze.com',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>KapTaze Giriş Bilgileri</title>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
                        .credentials { background: #fff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 5px solid #667eea; }
                        .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0; }
                        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                        .footer { text-align: center; color: #6c757d; font-size: 14px; margin-top: 30px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🏪 KapTaze Restaurant Panel</h1>
                            <p>Giriş bilgileriniz hazır!</p>
                        </div>
                        <div class="content">
                            <h2>Merhaba,</h2>
                            <p>KapTaze Restaurant platformuna hoş geldiniz! ${restaurantName ? `<strong>${restaurantName}</strong> restoranınız için` : 'Restaurant paneli'} giriş bilgileriniz aşağıda yer almaktadır:</p>

                            <div class="credentials">
                                <h3>🔑 Giriş Bilgileri</h3>
                                <p><strong>Kullanıcı Adı:</strong> <code>${username}</code></p>
                                <p><strong>Geçici Şifre:</strong> <code>${password}</code></p>
                                <p><strong>Giriş URL:</strong> <a href="https://kaptaze.com/restaurant-login">https://kaptaze.com/restaurant-login</a></p>
                            </div>

                            <div class="warning">
                                <h4>⚠️ Güvenlik Uyarısı</h4>
                                <p>İlk giriş yaptıktan sonra şifrenizi değiştirmeyi unutmayın. Bu geçici şifredir.</p>
                            </div>

                            <a href="https://kaptaze.com/restaurant-login" class="button">🚀 Restaurant Paneline Giriş Yap</a>

                            <h3>📋 Platform Özellikleri</h3>
                            <ul>
                                <li>✅ Sipariş yönetimi</li>
                                <li>✅ Menü ve paket düzenleme</li>
                                <li>✅ Müşteri bildirimleri</li>
                                <li>✅ Satış raporları</li>
                                <li>✅ Profil yönetimi</li>
                            </ul>

                            <h3>🆘 Yardım ve Destek</h3>
                            <p>Herhangi bir sorunuz olduğunda bize ulaşabilirsiniz:</p>
                            <ul>
                                <li>📧 E-posta: <a href="mailto:destek@kaptaze.com">destek@kaptaze.com</a></li>
                                <li>🌐 Website: <a href="https://kaptaze.com">kaptaze.com</a></li>
                            </ul>

                            <div class="footer">
                                <p>Bu e-posta KapTaze Restaurant Platform tarafından gönderilmiştir.</p>
                                <p>© 2025 KapTaze - Tüm hakları saklıdır.</p>
                            </div>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        console.log('📤 Sending email via SendGrid...');
        const result = await sgMail.send(mailOptions);

        console.log('✅ Email sent successfully via SendGrid!');
        console.log(`📧 Message ID: ${result[0].headers['x-message-id']}`);
        console.log(`📬 Email sent to: ${email}`);
        console.log(`🔑 Username: ${username}`);
        console.log(`🔐 Temporary password: ${password}`);

        return {
            success: true,
            messageId: result[0].headers['x-message-id'],
            username,
            password
        };

    } catch (error) {
        console.error('❌ Error sending email:', error.message);
        throw error;
    }
}

function generateTempPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

// Get arguments
const [,, email, username, restaurantName, tempPassword] = process.argv;

if (!email || !username) {
    console.log('Usage: node scripts/sendManualCredentials.js <email> <username> [restaurantName] [tempPassword]');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/sendManualCredentials.js rsmcihan@hotmail.com rsmcihan_rest "Cihan Restaurant"');
    console.log('  node scripts/sendManualCredentials.js rsmcihan@hotmail.com rsmcihan_rest "Cihan Restaurant" TempPass123');
    console.log('');
    process.exit(1);
}

// Send the email
sendCredentialsEmail(email, username, restaurantName, tempPassword)
    .then((result) => {
        console.log('\n🎉 Credentials email sent successfully!');
        console.log('📋 Next steps:');
        console.log('1. User can now login at: https://kaptaze.com/restaurant-login');
        console.log('2. They should change their password after first login');
        console.log('3. Check if account status is "active" in the system');
    })
    .catch((error) => {
        console.error('\n❌ Failed to send credentials email');
        console.error('Error:', error.message);
        process.exit(1);
    });