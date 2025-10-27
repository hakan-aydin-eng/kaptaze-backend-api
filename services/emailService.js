/**
 * Email Service - Brevo API Integration
 * Professional email service for kapkazan (HTTP API instead of SMTP)
 */

const brevo = require('@getbrevo/brevo');

class EmailService {
    constructor() {
        // Initialize Brevo API (HTTP - no SMTP ports needed!)
        const brevoApiKey = process.env.BREVO_API_KEY;

        if (brevoApiKey && brevoApiKey.length > 10) {
            this.apiInstance = new brevo.TransactionalEmailsApi();
            this.apiInstance.setApiKey(
                brevo.TransactionalEmailsApiApiKeys.apiKey,
                brevoApiKey
            );
            this.provider = 'brevo';
            console.log('📧 Email service initialized with Brevo API (HTTP) - Production Ready');
        } else {
            this.provider = 'mock';
            console.log('📧 Email service initialized in mock mode (no valid API key)');
        }

        this.fromEmail = process.env.FROM_EMAIL || 'bilgi@kapkazan.com';
        this.fromName = 'kapkazan - Sürpriz Paket Platformu';
    }

    async sendApplicationApprovalEmail(application, credentials) {
        const subject = '🎉 kapkazan Başvurunuz Onaylandı - Hoş Geldiniz!';
        const htmlContent = this.generateApprovalEmailHTML(application, credentials);
        const textContent = this.generateApprovalEmailText(application, credentials);

        return await this.sendEmail({
            to: application.email,
            subject,
            html: htmlContent,
            text: textContent
        });
    }

    async sendApplicationRejectionEmail(application, reason) {
        const subject = '❌ kapkazan Başvuru Durumu';
        const htmlContent = this.generateRejectionEmailHTML(application, reason);
        const textContent = this.generateRejectionEmailText(application, reason);

        return await this.sendEmail({
            to: application.email,
            subject,
            html: htmlContent,
            text: textContent
        });
    }

    async sendWelcomeEmail(user, isRestaurant = false) {
        const subject = `🎉 KapKazan'a Hoş Geldiniz - Sürpriz Paketler Sizi Bekliyor!`;
        const htmlContent = this.generateWelcomeEmailHTML(user, isRestaurant);
        const textContent = this.generateWelcomeEmailText(user, isRestaurant);

        return await this.sendEmail({
            to: user.email,
            subject,
            html: htmlContent,
            text: textContent
        });
    }

    async sendConsumerWelcomeEmail(consumer) {
        const subject = `🎉 kapkazan'a Hoş Geldiniz - Sürpriz Paketler Sizi Bekliyor!`;
        const htmlContent = this.generateConsumerWelcomeEmailHTML(consumer);
        const textContent = this.generateConsumerWelcomeEmailText(consumer);

        return await this.sendEmail({
            to: consumer.email,
            subject,
            html: htmlContent,
            text: textContent
        });
    }

    async sendPasswordResetEmail(user, resetToken) {
        const subject = '🔒 KapTaze Şifre Sıfırlama';
        const htmlContent = this.generatePasswordResetEmailHTML(user, resetToken);
        const textContent = this.generatePasswordResetEmailText(user, resetToken);

        return await this.sendEmail({
            to: user.email,
            subject,
            html: htmlContent,
            text: textContent
        });
    }

    async sendEmail({ to, subject, html, text }) {
        try {
            console.log('📧 [DEBUG] Preparing to send email:');
            console.log('  To:', to);
            console.log('  Subject:', subject);
            console.log('  From Email:', this.fromEmail);
            console.log('  From Name:', this.fromName);
            console.log('  Provider:', this.provider);
            console.log('  API Key exists:', !!process.env.BREVO_API_KEY);
            console.log('  API Key length:', process.env.BREVO_API_KEY?.length);

            if (this.provider === 'brevo') {
                // Brevo API format
                const sendSmtpEmail = new brevo.SendSmtpEmail();
                sendSmtpEmail.sender = { name: this.fromName, email: this.fromEmail };
                sendSmtpEmail.to = [{ email: to }];
                sendSmtpEmail.subject = subject;
                sendSmtpEmail.htmlContent = html;
                sendSmtpEmail.textContent = text;

                console.log('📤 [DEBUG] Sending via Brevo API (HTTP)...');
                const response = await this.apiInstance.sendTransacEmail(sendSmtpEmail);
                console.log(`✅ Email sent successfully to ${to}`);
                console.log('📨 Message ID:', response.messageId);
                return { success: true, messageId: response.messageId };
            } else {
                // Mock mode - log email instead of sending
                console.log('📧 Mock Email Send:', {
                    to,
                    subject,
                    provider: 'mock',
                    timestamp: new Date().toISOString()
                });
                return { success: true, messageId: 'mock_' + Date.now() };
            }

        } catch (error) {
            console.error('❌ [DEBUG] Email send failed:');
            console.error('  Error message:', error.message);
            console.error('  Error code:', error.code);
            console.error('  Error response:', error.response);
            console.error('  Full error:', error);
            throw new Error(`Email send failed: ${error.message}`);
        }
    }

    generateApprovalEmailHTML(application, credentials) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.15); }
                .header { background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; padding: 40px 30px; text-align: center; position: relative; }
                .header::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #fbbf24, #f59e0b, #fbbf24); }
                .header-icon { font-size: 64px; margin-bottom: 15px; animation: bounce 2s infinite; }
                @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
                .header h1 { margin: 0; font-size: 32px; font-weight: 900; text-shadow: 0 2px 10px rgba(0,0,0,0.2); }
                .header p { margin: 10px 0 0; opacity: 0.95; font-size: 16px; font-weight: 500; }
                .content { padding: 40px 30px; }
                .success-badge {
                    background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
                    border: 3px solid #059669;
                    color: #047857;
                    padding: 20px;
                    border-radius: 12px;
                    margin: 25px 0;
                    text-align: center;
                    font-weight: bold;
                    font-size: 18px;
                    box-shadow: 0 4px 12px rgba(5, 150, 105, 0.2);
                }
                .success-badge::before { content: '✨ '; }
                .success-badge::after { content: ' ✨'; }
                .welcome-text { font-size: 16px; line-height: 1.8; color: #374151; margin: 20px 0; }
                .credentials-box {
                    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
                    border: 3px dashed #059669;
                    padding: 25px;
                    border-radius: 12px;
                    margin: 30px 0;
                    box-shadow: inset 0 2px 8px rgba(0,0,0,0.05);
                }
                .credentials-box h3 { color: #059669; margin-bottom: 20px; font-size: 20px; }
                .cred-item { margin: 15px 0; display: flex; flex-direction: column; gap: 8px; }
                .cred-label { font-weight: 700; color: #1f2937; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
                .cred-value {
                    font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
                    background: white;
                    padding: 12px 16px;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    border: 2px solid #e5e7eb;
                    color: #059669;
                    letter-spacing: 1px;
                }
                .security-warning {
                    background: #fef3c7;
                    border-left: 4px solid #f59e0b;
                    padding: 15px;
                    margin: 20px 0;
                    border-radius: 8px;
                    font-size: 14px;
                }
                .button {
                    display: inline-block;
                    background: linear-gradient(135deg, #059669 0%, #047857 100%);
                    color: white !important;
                    padding: 16px 32px;
                    text-decoration: none;
                    border-radius: 12px;
                    margin: 25px 0;
                    font-weight: 700;
                    font-size: 16px;
                    box-shadow: 0 8px 20px rgba(5, 150, 105, 0.3);
                    transition: all 0.3s;
                    text-align: center;
                }
                .button:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(5, 150, 105, 0.4); }
                .steps { background: #f9fafb; padding: 20px; border-radius: 12px; margin: 25px 0; }
                .steps h4 { color: #059669; margin-bottom: 15px; font-size: 18px; }
                .steps ul { list-style: none; padding: 0; }
                .steps li { padding: 10px 0; padding-left: 30px; position: relative; color: #4b5563; }
                .steps li::before { content: '🚀'; position: absolute; left: 0; }
                .footer { background: #f8fafc; padding: 30px; text-align: center; color: #6b7280; font-size: 13px; line-height: 1.6; }
                .footer strong { color: #059669; }
                .divider { height: 2px; background: linear-gradient(90deg, transparent, #e5e7eb, transparent); margin: 30px 0; }
                @media (max-width: 600px) {
                    body { padding: 10px; }
                    .content { padding: 25px 20px; }
                    .header h1 { font-size: 26px; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="header-icon">🎊</div>
                    <h1>Başvurunuz Onaylandı!</h1>
                    <p>kapkazan - Sürpriz Paket Platformu</p>
                </div>
                <div class="content">
                    <div class="success-badge">
                        Tebrikler! ${application.businessName} başvurunuz onaylandı
                    </div>

                    <div class="welcome-text">
                        <p>Sayın <strong>${application.firstName} ${application.lastName}</strong>,</p>
                        <br>
                        <p><strong>kapkazan ailesine hoş geldiniz! 🌟</strong></p>
                        <p><strong>${application.businessName}</strong> işletmeniz için yaptığınız başvuru başarıyla onaylanmıştır. Artık sürpriz paketlerinizi satışa sunabilir, gıda israfını önleyebilir ve yeni müşterilere ulaşabilirsiniz!</p>
                    </div>

                    <div class="credentials-box">
                        <h3>🔑 Restoran Panel Giriş Bilgileriniz</h3>
                        <div class="cred-item">
                            <span class="cred-label">Kullanıcı Adı</span>
                            <div class="cred-value">${credentials.username}</div>
                        </div>
                        <div class="cred-item">
                            <span class="cred-label">Şifre</span>
                            <div class="cred-value">${credentials.password}</div>
                        </div>
                        <div class="cred-item">
                            <span class="cred-label">Panel Adresi</span>
                            <div class="cred-value">www.kapkazan.com/restaurant-login</div>
                        </div>
                    </div>

                    <div class="security-warning">
                        <strong>⚠️ Önemli Güvenlik Uyarısı:</strong> Bu giriş bilgilerini güvenli bir yerde saklayın ve asla kimseyle paylaşmayın. İlk girişinizden sonra şifrenizi değiştirebilirsiniz.
                    </div>

                    <center>
                        <a href="https://www.kapkazan.com/restaurant-login" class="button">
                            🚀 Restoran Paneline Giriş Yap
                        </a>
                    </center>

                    <div class="divider"></div>

                    <div class="steps">
                        <h4>📋 Hemen Başlamak İçin:</h4>
                        <ul>
                            <li>Restoran profilinizi ve çalışma saatlerinizi tamamlayın</li>
                            <li>İlk sürpriz paketinizi oluşturun ve fiyatlandırın</li>
                            <li>Menü fotoğraflarınızı yükleyin</li>
                            <li>Müşterilerinizden gelen siparişleri takip edin</li>
                        </ul>
                    </div>

                    <p style="margin-top: 30px; color: #6b7280; line-height: 1.8;">
                        Herhangi bir sorunuz veya teknik desteğe ihtiyacınız olursa <strong>bilgi@kapkazan.com</strong> adresinden bizimle iletişime geçebilirsiniz.
                    </p>

                    <div class="divider"></div>

                    <p style="text-align: center; font-size: 16px; color: #374151;">
                        <strong>Başarılar dileriz! 🎉</strong><br>
                        <span style="color: #059669; font-weight: 700;">kapkazan ekibi</span>
                    </p>
                </div>
                <div class="footer">
                    <p><strong>kapkazan</strong> - Gıda İsrafını Önleme ve Sürdürülebilirlik Platformu</p>
                    <p style="margin-top: 10px;">Bu e-posta otomatik olarak gönderilmiştir.</p>
                    <p>© 2025 kapkazan. Tüm hakları saklıdır.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    generateApprovalEmailText(application, credentials) {
        return `
🎉 Başvurunuz Onaylandı! - kapkazan

Sayın ${application.firstName} ${application.lastName},

Tebrikler! ${application.businessName} işletmeniz için yaptığınız başvuru onaylanmıştır.

🔑 Giriş Bilgileriniz:
Kullanıcı Adı: ${credentials.username}
Şifre: ${credentials.password}
Giriş Adresi: https://www.kapkazan.com/restaurant-login

⚠️ Bu bilgileri güvenli bir yerde saklayın ve kimseyle paylaşmayın.

📋 Sonraki Adımlar:
- Restoran profilinizi tamamlayın
- Menü ve ürünlerinizi ekleyin
- İşletme saatlerinizi güncelleyin
- Fotoğraflarınızı yükleyin

İyi çalışmalar dileriz!
kapkazan ekibi

---
Bu e-posta otomatik olarak gönderilmiştir.
© 2025 kapkazan. Tüm hakları saklıdır.
        `;
    }

    generateRejectionEmailHTML(application, reason) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #dc2626, #ef4444); color: white; padding: 30px; text-align: center; }
                .header h1 { margin: 0; font-size: 28px; }
                .content { padding: 30px; }
                .rejection-badge { background: #fef2f2; border: 2px solid #ef4444; color: #dc2626; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; font-weight: bold; }
                .reason-box { background: #f8fafc; border: 2px solid #e2e8f0; padding: 20px; border-radius: 8px; margin: 20px 0; }
                .footer { background: #f8fafc; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
                .button { display: inline-block; background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📋 Başvuru Durumu</h1>
                    <p>kapkazan Restaurant Platform</p>
                </div>
                <div class="content">
                    <div class="rejection-badge">
                        ❌ Maalesef ${application.businessName} başvurunuz şu an için onaylanamamıştır.
                    </div>

                    <p>Sayın <strong>${application.firstName} ${application.lastName}</strong>,</p>

                    <p>kapkazan platformuna olan ilginiz için teşekkür ederiz. Maalesef başvurunuz şu an için onaylanamamıştır.</p>
                    
                    <div class="reason-box">
                        <h4>📝 Red Nedeni:</h4>
                        <p>${reason}</p>
                    </div>
                    
                    <h4>🔄 Tekrar Başvuru</h4>
                    <p>Gerekli düzeltmeleri yaptıktan sonra tekrar başvuruda bulunabilirsiniz. Başvuru sürecinde size yardımcı olmaktan memnuniyet duyarız.</p>

                    <a href="https://www.kapkazan.com/customer-registration-v2" class="button">
                        📝 Yeni Başvuru Yap
                    </a>

                    <p>Sorularınız için bizimle iletişime geçebilirsiniz.</p>

                    <p>Saygılarımızla,<br><strong>kapkazan ekibi</strong></p>
                </div>
                <div class="footer">
                    <p>Bu e-posta otomatik olarak gönderilmiştir. Lütfen yanıtlamayın.</p>
                    <p>© 2025 kapkazan. Tüm hakları saklıdır.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    generateRejectionEmailText(application, reason) {
        return `
📋 Başvuru Durumu - kapkazan

Sayın ${application.firstName} ${application.lastName},

Maalesef ${application.businessName} başvurunuz şu an için onaylanamamıştır.

📝 Red Nedeni:
${reason}

🔄 Gerekli düzeltmeleri yaptıktan sonra tekrar başvuruda bulunabilirsiniz.

Yeni başvuru: https://www.kapkazan.com/customer-registration-v2

Saygılarımızla,
kapkazan ekibi

---
Bu e-posta otomatik olarak gönderilmiştir.
© 2025 kapkazan. Tüm hakları saklıdır.
        `;
    }

    generateWelcomeEmailHTML(user, isRestaurant) {
        const role = isRestaurant ? 'Restaurant Owner' : 'Admin';
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #16a34a, #22c55e); color: white; padding: 30px; text-align: center; }
                .header h1 { margin: 0; font-size: 28px; }
                .content { padding: 30px; }
                .welcome-badge { background: #f0fdf4; border: 2px solid #16a34a; color: #15803d; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; font-weight: bold; }
                .footer { background: #f8fafc; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
                .button { display: inline-block; background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🌟 Hoş Geldiniz!</h1>
                    <p>kapkazan Restaurant Platform</p>
                </div>
                <div class="content">
                    <div class="welcome-badge">
                        🎉 kapkazan ailesine hoş geldiniz!
                    </div>

                    <p>Sayın <strong>${user.firstName} ${user.lastName}</strong>,</p>

                    <p>kapkazan platformuna hoş geldiniz! Hesabınız başarıyla oluşturuldu ve artık platformumuzun tüm özelliklerinden yararlanabilirsiniz.</p>
                    
                    <p><strong>Hesap Türü:</strong> ${role}</p>
                    <p><strong>E-posta:</strong> ${user.email}</p>
                    
                    <p>Platformumuzda keyifli vakit geçirmenizi dileriz!</p>

                    <p>Saygılarımızla,<br><strong>kapkazan ekibi</strong></p>
                </div>
                <div class="footer">
                    <p>© 2025 kapkazan. Tüm hakları saklıdır.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    generateWelcomeEmailText(user, isRestaurant) {
        const role = isRestaurant ? 'Restaurant Owner' : 'Admin';
        return `
🌟 Hoş Geldiniz! - kapkazan

Sayın ${user.firstName} ${user.lastName},

kapkazan platformuna hoş geldiniz! Hesabınız başarıyla oluşturuldu.

Hesap Türü: ${role}
E-posta: ${user.email}

Platformumuzda keyifli vakit geçirmenizi dileriz!

Saygılarımızla,
kapkazan ekibi

© 2025 kapkazan. Tüm hakları saklıdır.
        `;
    }

    generateConsumerWelcomeEmailHTML(consumer) {
        const fullName = `${consumer.name} ${consumer.surname}`;
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #16a34a, #22c55e); color: white; padding: 30px; text-align: center; }
                .header h1 { margin: 0; font-size: 28px; }
                .content { padding: 30px; }
                .welcome-badge { background: #f0fdf4; border: 2px solid #16a34a; color: #15803d; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; font-weight: bold; font-size: 18px; }
                .info-box { background: #f8fafc; border-left: 4px solid #16a34a; padding: 15px; margin: 20px 0; border-radius: 4px; }
                .info-box strong { color: #15803d; }
                .features { margin: 20px 0; }
                .feature-item { padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
                .feature-item:last-child { border-bottom: none; }
                .button { display: inline-block; background: #16a34a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; }
                .footer { background: #f8fafc; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 Hoş Geldiniz!</h1>
                    <p>kapkazan - Sürpriz Paket Platformu</p>
                </div>
                <div class="content">
                    <div class="welcome-badge">
                        kapkazan ailesine hoş geldiniz! 🎊
                    </div>

                    <p>Merhaba <strong>${fullName}</strong>,</p>

                    <p>kapkazan'a hoş geldiniz! Hesabınız başarıyla oluşturuldu. Artık yerel restoranlardan sürpriz paketler alarak hem tasarruf edebilir, hem de israfın önüne geçebilirsiniz! 🌍💚</p>

                    <div class="info-box">
                        <p style="margin: 0;"><strong>📧 E-posta:</strong> ${consumer.email}</p>
                        <p style="margin: 10px 0 0 0;"><strong>🔐 Şifre:</strong> Kayıt sırasında belirlediğiniz şifre</p>
                        <p style="margin: 10px 0 0 0; font-size: 14px; color: #6b7280;">
                            <strong>❓ Şifrenizi mi unuttunuz?</strong><br>
                            Mobil uygulamada <strong>"Şifremi Unuttum"</strong> butonuna tıklayarak kolayca yeni şifre oluşturabilirsiniz.
                        </p>
                    </div>

                    <div class="features">
                        <h3 style="color: #15803d;">✨ kapkazan ile Neler Yapabilirsiniz?</h3>
                        <div class="feature-item">
                            <strong>🎁 Sürpriz Paketler:</strong> %50'ye varan indirimlerle lezzetli paketler keşfedin
                        </div>
                        <div class="feature-item">
                            <strong>🏪 Yerel Restoranlar:</strong> Çevrenizdeki restoranları destekleyin
                        </div>
                        <div class="feature-item">
                            <strong>💳 Kolay Ödeme:</strong> Nakit veya online ödeme seçenekleri
                        </div>
                        <div class="feature-item">
                            <strong>📸 Hikaye Paylaş:</strong> Aldığınız paketlerin fotoğrafını paylaşın
                        </div>
                        <div class="feature-item">
                            <strong>⭐ Puan Ver:</strong> Deneyimlerinizi diğer kullanıcılarla paylaşın
                        </div>
                    </div>

                    <center>
                        <a href="https://www.kapkazan.com" class="button">🚀 Hemen Keşfetmeye Başlayın</a>
                    </center>

                    <p style="margin-top: 30px;">Sorularınız için bize <a href="mailto:bilgi@kapkazan.com">bilgi@kapkazan.com</a> adresinden ulaşabilirsiniz.</p>

                    <p>Keyifli alışverişler,<br><strong>kapkazan ekibi</strong> 💚</p>
                </div>
                <div class="footer">
                    <p>© 2025 kapkazan. Tüm hakları saklıdır.</p>
                    <p style="margin-top: 10px; font-size: 12px;">Bu mail otomatik olarak gönderilmiştir.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    generateConsumerWelcomeEmailText(consumer) {
        const fullName = `${consumer.name} ${consumer.surname}`;
        return `
🎉 kapkazan'a Hoş Geldiniz!

Merhaba ${fullName},

kapkazan ailesine hoş geldiniz! Hesabınız başarıyla oluşturuldu.

GİRİŞ BİLGİLERİNİZ:
📧 E-posta: ${consumer.email}
🔐 Şifre: Kayıt sırasında belirlediğiniz şifre

❓ Şifrenizi mi unuttunuz?
Mobil uygulamada "Şifremi Unuttum" butonuna tıklayarak
kolayca yeni şifre oluşturabilirsiniz.

✨ kapkazan İLE NELER YAPABİLİRSİNİZ?

🎁 Sürpriz Paketler: %50'ye varan indirimlerle lezzetli paketler
🏪 Yerel Restoranlar: Çevrenizdeki restoranları destekleyin
💳 Kolay Ödeme: Nakit veya online ödeme seçenekleri
📸 Hikaye Paylaş: Aldığınız paketlerin fotoğrafını paylaşın
⭐ Puan Ver: Deneyimlerinizi paylaşın

🚀 Mobil uygulamadan hemen keşfetmeye başlayın!

Sorularınız için: bilgi@kapkazan.com

Keyifli alışverişler,
kapkazan ekibi 💚

---
© 2025 kapkazan. Tüm hakları saklıdır.
        `;
    }

    generatePasswordResetEmailHTML(user, resetToken) {
        const resetUrl = `https://www.kapkazan.com/reset-password.html?token=${resetToken}`;
        const fullName = user.name && user.surname
            ? `${user.name} ${user.surname}`
            : (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : 'Değerli Kullanıcı');

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #f59e0b, #f97316); color: white; padding: 30px; text-align: center; }
                .header h1 { margin: 0; font-size: 28px; }
                .content { padding: 30px; }
                .warning-badge { background: #fef3c7; border: 2px solid #f59e0b; color: #92400e; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; font-weight: bold; }
                .footer { background: #f8fafc; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
                .button { display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔒 Şifre Sıfırlama</h1>
                    <p>kapkazan - Sürpriz Paket Platformu</p>
                </div>
                <div class="content">
                    <div class="warning-badge">
                        ⚠️ Şifre sıfırlama talebiniz alındı
                    </div>

                    <p>Merhaba <strong>${fullName}</strong>,</p>

                    <p>Hesabınız için şifre sıfırlama talebinde bulundunuz. Aşağıdaki butona tıklayarak yeni şifrenizi belirleyebilirsiniz.</p>

                    <a href="${resetUrl}" class="button">
                        🔑 Şifreyi Sıfırla
                    </a>

                    <p><strong>⚠️ Güvenlik Uyarısı:</strong></p>
                    <ul>
                        <li>Bu link 24 saat geçerlidir</li>
                        <li>Link yalnızca bir kez kullanılabilir</li>
                        <li>Eğer bu talebi siz yapmadıysanız, bu e-postayı görmezden gelin</li>
                    </ul>

                    <p>Saygılarımızla,<br><strong>kapkazan ekibi</strong></p>
                </div>
                <div class="footer">
                    <p>Bu e-posta otomatik olarak gönderilmiştir. Lütfen yanıtlamayın.</p>
                    <p>© 2025 kapkazan. Tüm hakları saklıdır.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    generatePasswordResetEmailText(user, resetToken) {
        const resetUrl = `https://www.kapkazan.com/reset-password.html?token=${resetToken}`;
        const fullName = user.name && user.surname
            ? `${user.name} ${user.surname}`
            : (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : 'Değerli Kullanıcı');

        return `
🔒 Şifre Sıfırlama - kapkazan

Merhaba ${fullName},

Hesabınız için şifre sıfırlama talebinde bulundunuz.

Şifreyi sıfırlamak için: ${resetUrl}

⚠️ Güvenlik Uyarısı:
- Bu link 24 saat geçerlidir
- Link yalnızca bir kez kullanılabilir
- Eğer bu talebi siz yapmadıysanız, bu e-postayı görmezden gelin

Saygılarımızla,
kapkazan ekibi

---
Bu e-posta otomatik olarak gönderilmiştir.
© 2025 kapkazan. Tüm hakları saklıdır.
        `;
    }

    // NEW: Order notification email to restaurant
    async sendOrderNotificationEmail(order, restaurant) {
        const subject = '🔔 Yeni Sipariş Aldınız! - kapkazan';
        const htmlContent = this.generateOrderNotificationHTML(order, restaurant);
        const textContent = this.generateOrderNotificationText(order, restaurant);

        return await this.sendEmail({
            to: restaurant.email,
            subject,
            html: htmlContent,
            text: textContent
        });
    }

    generateOrderNotificationHTML(order, restaurant) {
        const customerName = order.customer?.name || 'Müşteri';
        const customerPhone = order.customer?.phone || 'Belirtilmemiş';
        const orderNumber = order.orderNumber || order._id;
        const pickupCode = order.pickupCode || 'N/A';
        const totalPrice = order.totalPrice || 0;
        const paymentMethod = order.paymentMethod === 'cash' ? 'Nakit' : 'Online Ödeme';

        // Order items
        const itemsHTML = order.items?.map(item => `
            <div class="order-item">
                <span class="item-name">${item.name || item.title}</span>
                <span class="item-qty">×${item.quantity}</span>
                <span class="item-price">₺${item.price}</span>
            </div>
        `).join('') || '<p>Sipariş detayları bulunamadı</p>';

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.15); }
                .header { background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; padding: 40px 30px; text-align: center; position: relative; }
                .header::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #fbbf24, #f59e0b, #fbbf24); }
                .header-icon { font-size: 64px; margin-bottom: 15px; animation: bounce 2s infinite; }
                @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
                .header h1 { margin: 0; font-size: 32px; font-weight: 900; text-shadow: 0 2px 10px rgba(0,0,0,0.2); }
                .header p { margin: 10px 0 0; opacity: 0.95; font-size: 16px; font-weight: 500; }
                .content { padding: 40px 30px; }
                .success-badge {
                    background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
                    border: 3px solid #059669;
                    color: #047857;
                    padding: 20px;
                    border-radius: 12px;
                    margin: 25px 0;
                    text-align: center;
                    font-weight: bold;
                    font-size: 18px;
                    box-shadow: 0 4px 12px rgba(5, 150, 105, 0.2);
                }
                .success-badge::before { content: '✨ '; }
                .success-badge::after { content: ' ✨'; }
                .order-box {
                    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
                    border: 3px dashed #059669;
                    padding: 25px;
                    border-radius: 12px;
                    margin: 30px 0;
                    box-shadow: inset 0 2px 8px rgba(0,0,0,0.05);
                }
                .order-box h3 { color: #059669; margin-bottom: 20px; font-size: 20px; }
                .order-detail { margin: 15px 0; display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
                .order-detail:last-child { border-bottom: none; }
                .order-label { font-weight: 700; color: #1f2937; font-size: 14px; }
                .order-value {
                    font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
                    font-size: 16px;
                    font-weight: 600;
                    color: #059669;
                }
                .order-item { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
                .item-name { flex: 1; color: #374151; }
                .item-qty { color: #6b7280; margin: 0 10px; }
                .item-price { color: #059669; font-weight: 600; }
                .button {
                    display: inline-block;
                    background: linear-gradient(135deg, #059669 0%, #047857 100%);
                    color: white !important;
                    padding: 16px 32px;
                    text-decoration: none;
                    border-radius: 12px;
                    margin: 25px 0;
                    font-weight: 700;
                    font-size: 16px;
                    box-shadow: 0 8px 20px rgba(5, 150, 105, 0.3);
                    transition: all 0.3s;
                    text-align: center;
                }
                .button:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(5, 150, 105, 0.4); }
                .urgent-notice {
                    background: #fef3c7;
                    border-left: 4px solid #f59e0b;
                    padding: 15px;
                    margin: 20px 0;
                    border-radius: 8px;
                    font-size: 14px;
                }
                .footer { background: #f8fafc; padding: 30px; text-align: center; color: #6b7280; font-size: 13px; line-height: 1.6; }
                .footer strong { color: #059669; }
                .divider { height: 2px; background: linear-gradient(90deg, transparent, #e5e7eb, transparent); margin: 30px 0; }
                @media (max-width: 600px) {
                    body { padding: 10px; }
                    .content { padding: 25px 20px; }
                    .header h1 { font-size: 26px; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="header-icon">🔔</div>
                    <h1>Yeni Sipariş Aldınız!</h1>
                    <p>kapkazan - Sürpriz Paket Platformu</p>
                </div>
                <div class="content">
                    <div class="success-badge">
                        Yeni sipariş: ${customerName}
                    </div>

                    <div class="order-box">
                        <h3>📦 Sipariş Detayları</h3>
                        <div class="order-detail">
                            <span class="order-label">Sipariş Numarası</span>
                            <span class="order-value">${orderNumber}</span>
                        </div>
                        <div class="order-detail">
                            <span class="order-label">Pickup Kodu</span>
                            <span class="order-value">${pickupCode}</span>
                        </div>
                        <div class="order-detail">
                            <span class="order-label">Müşteri Adı</span>
                            <span class="order-value">${customerName}</span>
                        </div>
                        <div class="order-detail">
                            <span class="order-label">Müşteri Telefon</span>
                            <span class="order-value">${customerPhone}</span>
                        </div>
                        <div class="order-detail">
                            <span class="order-label">Ödeme Yöntemi</span>
                            <span class="order-value">${paymentMethod}</span>
                        </div>
                        <div class="order-detail">
                            <span class="order-label">Toplam Tutar</span>
                            <span class="order-value" style="font-size: 20px; font-weight: 800;">₺${totalPrice.toFixed(2)}</span>
                        </div>
                    </div>

                    <div class="order-box">
                        <h3>🍽️ Sipariş İçeriği</h3>
                        ${itemsHTML}
                    </div>

                    <div class="urgent-notice">
                        <strong>⚠️ Önemli:</strong> Lütfen siparişi restoran panelinizden onaylayın ve müşteriyi bilgilendirin.
                    </div>

                    <center>
                        <a href="https://www.kapkazan.com/restaurant-panel.html" class="button">
                            🚀 Restoran Paneline Git
                        </a>
                    </center>

                    <div class="divider"></div>

                    <p style="text-align: center; font-size: 16px; color: #374151;">
                        <strong>İyi satışlar! 🎉</strong><br>
                        <span style="color: #059669; font-weight: 700;">kapkazan ekibi</span>
                    </p>
                </div>
                <div class="footer">
                    <p><strong>kapkazan</strong> - Sürpriz Paket Platformu</p>
                    <p style="margin-top: 10px;">Bu e-posta otomatik olarak gönderilmiştir.</p>
                    <p>© 2025 kapkazan. Tüm hakları saklıdır.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    generateOrderNotificationText(order, restaurant) {
        const customerName = order.customer?.name || 'Müşteri';
        const customerPhone = order.customer?.phone || 'Belirtilmemiş';
        const orderNumber = order.orderNumber || order._id;
        const pickupCode = order.pickupCode || 'N/A';
        const totalPrice = order.totalPrice || 0;
        const paymentMethod = order.paymentMethod === 'cash' ? 'Nakit' : 'Online Ödeme';

        return `
🔔 Yeni Sipariş Aldınız! - kapkazan

Sayın ${restaurant.businessName || 'Restaurant'},

Yeni bir sipariş aldınız! 🎉

📦 SİPARİŞ DETAYLARI:
Sipariş No: ${orderNumber}
Pickup Kodu: ${pickupCode}
Müşteri: ${customerName}
Telefon: ${customerPhone}
Ödeme: ${paymentMethod}
Toplam Tutar: ₺${totalPrice.toFixed(2)}

⚠️ Lütfen siparişi restoran panelinizden onaylayın.

Panel: https://www.kapkazan.com/restaurant-panel.html

İyi satışlar!
kapkazan ekibi

---
Bu e-posta otomatik olarak gönderilmiştir.
© 2025 kapkazan. Tüm hakları saklıdır.
        `;
    }

    // NEW: Order cancellation email to consumer
    async sendOrderCancellationEmail(order, consumer, reason) {
        const subject = '⚠️ Siparişiniz İptal Edildi - kapkazan';
        const htmlContent = this.generateOrderCancellationHTML(order, consumer, reason);
        const textContent = this.generateOrderCancellationText(order, consumer, reason);

        return await this.sendEmail({
            to: consumer.email,
            subject,
            html: htmlContent,
            text: textContent
        });
    }

    generateOrderCancellationHTML(order, consumer, reason) {
        const customerName = `${consumer.name} ${consumer.surname}`;
        const orderNumber = order.orderNumber || order._id;
        const totalPrice = order.totalPrice || 0;
        const restaurantName = order.restaurant?.name || order.restaurant?.businessName || 'Restaurant';
        const paymentMethod = order.paymentMethod === 'cash' ? 'Nakit' : 'Online Ödeme';
        const refundMessage = order.paymentMethod === 'online'
            ? '<p style="color: #047857; font-weight: 600;">💳 Online ödemeniz 3-5 iş günü içinde iade edilecektir.</p>'
            : '<p style="color: #6b7280;">Nakit ödeme yapılmadığı için iade işlemi bulunmamaktadır.</p>';

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.15); }
                .header { background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%); color: white; padding: 40px 30px; text-align: center; position: relative; }
                .header::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #fbbf24, #f59e0b, #fbbf24); }
                .header-icon { font-size: 64px; margin-bottom: 15px; animation: bounce 2s infinite; }
                @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
                .header h1 { margin: 0; font-size: 32px; font-weight: 900; text-shadow: 0 2px 10px rgba(0,0,0,0.2); }
                .header p { margin: 10px 0 0; opacity: 0.95; font-size: 16px; font-weight: 500; }
                .content { padding: 40px 30px; }
                .warning-badge {
                    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
                    border: 3px solid #f59e0b;
                    color: #92400e;
                    padding: 20px;
                    border-radius: 12px;
                    margin: 25px 0;
                    text-align: center;
                    font-weight: bold;
                    font-size: 18px;
                    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2);
                }
                .warning-badge::before { content: '⚠️ '; }
                .warning-badge::after { content: ' ⚠️'; }
                .order-box {
                    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
                    border: 3px dashed #f59e0b;
                    padding: 25px;
                    border-radius: 12px;
                    margin: 30px 0;
                    box-shadow: inset 0 2px 8px rgba(0,0,0,0.05);
                }
                .order-box h3 { color: #f59e0b; margin-bottom: 20px; font-size: 20px; }
                .order-detail { margin: 15px 0; display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
                .order-detail:last-child { border-bottom: none; }
                .order-label { font-weight: 700; color: #1f2937; font-size: 14px; }
                .order-value {
                    font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
                    font-size: 16px;
                    font-weight: 600;
                    color: #f59e0b;
                }
                .reason-box {
                    background: #fef3c7;
                    border-left: 4px solid #f59e0b;
                    padding: 20px;
                    margin: 20px 0;
                    border-radius: 8px;
                    font-size: 15px;
                    line-height: 1.6;
                }
                .reason-box strong { color: #92400e; display: block; margin-bottom: 10px; }
                .button {
                    display: inline-block;
                    background: linear-gradient(135deg, #059669 0%, #047857 100%);
                    color: white !important;
                    padding: 16px 32px;
                    text-decoration: none;
                    border-radius: 12px;
                    margin: 25px 0;
                    font-weight: 700;
                    font-size: 16px;
                    box-shadow: 0 8px 20px rgba(5, 150, 105, 0.3);
                    transition: all 0.3s;
                    text-align: center;
                }
                .button:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(5, 150, 105, 0.4); }
                .refund-notice {
                    background: #d1fae5;
                    border: 2px solid #047857;
                    padding: 20px;
                    margin: 20px 0;
                    border-radius: 12px;
                    text-align: center;
                }
                .footer { background: #f8fafc; padding: 30px; text-align: center; color: #6b7280; font-size: 13px; line-height: 1.6; }
                .footer strong { color: #f59e0b; }
                .divider { height: 2px; background: linear-gradient(90deg, transparent, #e5e7eb, transparent); margin: 30px 0; }
                @media (max-width: 600px) {
                    body { padding: 10px; }
                    .content { padding: 25px 20px; }
                    .header h1 { font-size: 26px; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="header-icon">⚠️</div>
                    <h1>Siparişiniz İptal Edildi</h1>
                    <p>kapkazan - Sürpriz Paket Platformu</p>
                </div>
                <div class="content">
                    <div class="warning-badge">
                        Sipariş #${orderNumber} iptal edildi
                    </div>

                    <p>Sayın <strong>${customerName}</strong>,</p>
                    <br>
                    <p><strong>${restaurantName}</strong> restoranından verdiğiniz sipariş maalesef iptal edildi.</p>

                    <div class="order-box">
                        <h3>📦 İptal Edilen Sipariş Detayları</h3>
                        <div class="order-detail">
                            <span class="order-label">Sipariş Numarası</span>
                            <span class="order-value">${orderNumber}</span>
                        </div>
                        <div class="order-detail">
                            <span class="order-label">Restaurant</span>
                            <span class="order-value">${restaurantName}</span>
                        </div>
                        <div class="order-detail">
                            <span class="order-label">Ödeme Yöntemi</span>
                            <span class="order-value">${paymentMethod}</span>
                        </div>
                        <div class="order-detail">
                            <span class="order-label">Tutar</span>
                            <span class="order-value" style="font-size: 20px; font-weight: 800;">₺${totalPrice.toFixed(2)}</span>
                        </div>
                    </div>

                    <div class="reason-box">
                        <strong>📝 İptal Nedeni:</strong>
                        <p>${reason || 'Belirtilmemiş'}</p>
                    </div>

                    <div class="refund-notice">
                        <h3 style="color: #047857; margin-bottom: 15px;">💰 İade Bilgisi</h3>
                        ${refundMessage}
                    </div>

                    <p style="margin: 30px 0; line-height: 1.8; color: #374151;">
                        Bu durumdan dolayı üzgünüz. Başka restoranlardan sipariş vermeye devam edebilirsiniz!
                    </p>

                    <center>
                        <a href="https://www.kapkazan.com" class="button">
                            🍽️ Yeni Sipariş Ver
                        </a>
                    </center>

                    <div class="divider"></div>

                    <p style="margin-top: 30px; color: #6b7280; line-height: 1.8; font-size: 14px;">
                        Sorularınız için <strong>bilgi@kapkazan.com</strong> adresinden bizimle iletişime geçebilirsiniz.
                    </p>

                    <p style="text-align: center; font-size: 16px; color: #374151; margin-top: 20px;">
                        <strong>Anlayışınız için teşekkürler</strong><br>
                        <span style="color: #f59e0b; font-weight: 700;">kapkazan ekibi</span>
                    </p>
                </div>
                <div class="footer">
                    <p><strong>kapkazan</strong> - Sürpriz Paket Platformu</p>
                    <p style="margin-top: 10px;">Bu e-posta otomatik olarak gönderilmiştir.</p>
                    <p>© 2025 kapkazan. Tüm hakları saklıdır.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    generateOrderCancellationText(order, consumer, reason) {
        const customerName = `${consumer.name} ${consumer.surname}`;
        const orderNumber = order.orderNumber || order._id;
        const totalPrice = order.totalPrice || 0;
        const restaurantName = order.restaurant?.name || order.restaurant?.businessName || 'Restaurant';
        const paymentMethod = order.paymentMethod === 'cash' ? 'Nakit' : 'Online Ödeme';
        const refundMessage = order.paymentMethod === 'online'
            ? '💳 Online ödemeniz 3-5 iş günü içinde iade edilecektir.'
            : 'Nakit ödeme yapılmadığı için iade işlemi bulunmamaktadır.';

        return `
⚠️ Siparişiniz İptal Edildi - kapkazan

Sayın ${customerName},

${restaurantName} restoranından verdiğiniz sipariş maalesef iptal edildi.

📦 İPTAL EDİLEN SİPARİŞ:
Sipariş No: ${orderNumber}
Restaurant: ${restaurantName}
Ödeme: ${paymentMethod}
Tutar: ₺${totalPrice.toFixed(2)}

📝 İPTAL NEDENİ:
${reason || 'Belirtilmemiş'}

💰 İADE BİLGİSİ:
${refundMessage}

Bu durumdan dolayı üzgünüz. Başka restoranlardan sipariş vermeye devam edebilirsiniz!

🍽️ Yeni sipariş vermek için: https://www.kapkazan.com

Sorularınız için: bilgi@kapkazan.com

Anlayışınız için teşekkürler,
kapkazan ekibi

---
Bu e-posta otomatik olarak gönderilmiştir.
© 2025 kapkazan. Tüm hakları saklıdır.
        `;
    }
}

// Export singleton instance
module.exports = new EmailService();