const sgMail = require('@sendgrid/mail');
require('dotenv').config();

async function sendManualCredentials() {
    console.log('📧 Manual email sender for restaurant credentials');

    // User credentials found from database
    const userCredentials = {
        firstName: 'RASİM',
        lastName: 'CİHAN',
        email: 'rsmcihan@hotmail.com',
        phone: '05425453007',
        businessName: 'Rasim Ev Yemekleri',
        username: 'rasimevy514',
        // Password is already hashed in DB, we need to generate a new temporary one
        temporaryPassword: 'Kaptaze2025!'
    };

    console.log('👤 Sending credentials to:', userCredentials.email);
    console.log('🏪 Business:', userCredentials.businessName);
    console.log('🔑 Username:', userCredentials.username);

    // SendGrid configuration
    if (!process.env.SENDGRID_API_KEY) {
        throw new Error('SendGrid API key not configured');
    }
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const emailHTML = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { text-align: center; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: bold; color: #ff6b35; margin-bottom: 10px; }
            .credentials { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .credential-item { margin: 10px 0; padding: 10px; background: white; border-left: 4px solid #ff6b35; }
            .button { display: inline-block; background: #ff6b35; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">🍽️ KapTaze</div>
                <h2>Restoran Paneli Giriş Bilgileriniz</h2>
            </div>

            <p>Merhaba <strong>${userCredentials.firstName} ${userCredentials.lastName}</strong>,</p>

            <p><strong>${userCredentials.businessName}</strong> işletmenizin KapTaze platformuna kaydı başarıyla tamamlanmıştır! 🎉</p>

            <div class="credentials">
                <h3>📋 Giriş Bilgileriniz:</h3>
                <div class="credential-item">
                    <strong>🌐 Panel Adresi:</strong> https://kaptaze.com/restaurant
                </div>
                <div class="credential-item">
                    <strong>👤 Kullanıcı Adı:</strong> ${userCredentials.username}
                </div>
                <div class="credential-item">
                    <strong>🔐 Geçici Şifre:</strong> ${userCredentials.temporaryPassword}
                </div>
            </div>

            <p><strong>⚠️ Önemli Güvenlik Notları:</strong></p>
            <ul>
                <li>İlk girişinizden sonra şifrenizi değiştirmeniz önerilir</li>
                <li>Giriş bilgilerinizi kimseyle paylaşmayın</li>
                <li>Bu mail otomatik olarak gönderilmiştir</li>
            </ul>

            <div style="text-align: center;">
                <a href="https://kaptaze.com/restaurant" class="button">
                    🚀 Restoran Paneline Git
                </a>
            </div>

            <p><strong>📱 KapTaze ile neler yapabilirsiniz:</strong></p>
            <ul>
                <li>✅ Siparişleri gerçek zamanlı takip edin</li>
                <li>🍽️ Menü ve fiyatlarınızı güncelleyin</li>
                <li>📊 Satış raporlarınızı görüntüleyin</li>
                <li>🔔 Anlık sipariş bildirimleri alın</li>
                <li>👥 Müşteri yorumlarını yönetin</li>
            </ul>

            <div class="footer">
                <p>Herhangi bir sorunuz olursa bizimle iletişime geçebilirsiniz:</p>
                <p>📧 <a href="mailto:info@kaptaze.com">info@kaptaze.com</a></p>
                <p>📱 WhatsApp: +90 XXX XXX XX XX</p>
                <hr style="margin: 20px 0;">
                <p>KapTaze - Lezzet Kapınızda! 🚀</p>
            </div>
        </div>
    </body>
    </html>
    `;

    const mailOptions = {
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@kaptaze.com',
        to: userCredentials.email,
        subject: '🔑 KapTaze Restoran Paneli - Giriş Bilgileriniz',
        html: emailHTML
    };

    try {
        console.log('📤 Sending email via SendGrid...');
        const result = await sgMail.send(mailOptions);
        console.log('✅ Email sent successfully via SendGrid!');
        console.log('📨 Message ID:', result[0].headers['x-message-id']);
        console.log('📬 Email sent to:', userCredentials.email);

        return true;
    } catch (error) {
        console.error('❌ SendGrid email sending failed:', error.message);
        return false;
    }
}

// Run the function
sendManualCredentials()
    .then((success) => {
        if (success) {
            console.log('🎉 Manual email process completed successfully!');
        } else {
            console.log('😞 Email sending failed');
        }
        process.exit(success ? 0 : 1);
    })
    .catch((error) => {
        console.error('💥 Fatal error:', error);
        process.exit(1);
    });