/**
 * Email Service - SendGrid Integration
 * Professional email service for KapTaze
 */

const sgMail = require('@sendgrid/mail');

class EmailService {
    constructor() {
        // Initialize SendGrid
        const apiKey = process.env.SENDGRID_API_KEY;
        if (apiKey && apiKey.length > 10 && apiKey.startsWith('SG.')) {
            sgMail.setApiKey(apiKey);
            this.provider = 'sendgrid';
            console.log('📧 Email service initialized with SendGrid - Production Ready');
        } else {
            this.provider = 'mock';
            console.log('📧 Email service initialized in mock mode (no valid API key)');
        }
        
        this.fromEmail = process.env.FROM_EMAIL || 'noreply@kaptaze.com';
        this.fromName = 'KapTaze Restaurant Platform';
    }

    async sendApplicationApprovalEmail(application, credentials) {
        const subject = '🎉 KapTaze Başvurunuz Onaylandı!';
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
        const subject = '❌ KapTaze Başvuru Durumu';
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
        const subject = `🌟 KapTaze'ye Hoş Geldiniz!`;
        const htmlContent = this.generateWelcomeEmailHTML(user, isRestaurant);
        const textContent = this.generateWelcomeEmailText(user, isRestaurant);

        return await this.sendEmail({
            to: user.email,
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
            const emailData = {
                to,
                from: {
                    email: this.fromEmail,
                    name: this.fromName
                },
                subject,
                html,
                text
            };

            if (this.provider === 'sendgrid') {
                const response = await sgMail.send(emailData);
                console.log(`✅ Email sent successfully to ${to}:`, response[0].statusCode);
                return { success: true, messageId: response[0].headers['x-message-id'] };
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
            console.error('❌ Email send failed:', error);
            throw new Error(`Email send failed: ${error.message}`);
        }
    }

    generateApprovalEmailHTML(application, credentials) {
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
                .success-badge { background: #f0fdf4; border: 2px solid #16a34a; color: #15803d; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; font-weight: bold; }
                .credentials-box { background: #f8fafc; border: 2px solid #e2e8f0; padding: 20px; border-radius: 8px; margin: 20px 0; }
                .cred-item { margin: 10px 0; }
                .cred-label { font-weight: bold; color: #374151; }
                .cred-value { font-family: 'Courier New', monospace; background: #e5e7eb; padding: 5px 10px; border-radius: 4px; }
                .footer { background: #f8fafc; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
                .button { display: inline-block; background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 Başvurunuz Onaylandı!</h1>
                    <p>KapTaze Restaurant Platform</p>
                </div>
                <div class="content">
                    <div class="success-badge">
                        ✅ Tebrikler! ${application.businessName} başvurunuz onaylandı.
                    </div>
                    
                    <p>Sayın <strong>${application.firstName} ${application.lastName}</strong>,</p>
                    
                    <p>KapTaze platformuna hoş geldiniz! <strong>${application.businessName}</strong> işletmeniz için yaptığınız başvuru onaylanmıştır.</p>
                    
                    <div class="credentials-box">
                        <h3>🔑 Giriş Bilgileriniz</h3>
                        <div class="cred-item">
                            <span class="cred-label">Kullanıcı Adı:</span>
                            <span class="cred-value">${credentials.username}</span>
                        </div>
                        <div class="cred-item">
                            <span class="cred-label">Şifre:</span>
                            <span class="cred-value">${credentials.password}</span>
                        </div>
                        <div class="cred-item">
                            <span class="cred-label">Giriş Adresi:</span>
                            <span class="cred-value">https://kaptaze.com/restaurant-login.html</span>
                        </div>
                    </div>
                    
                    <p><strong>⚠️ Güvenlik Uyarısı:</strong> Bu bilgileri güvenli bir yerde saklayın ve kimseyle paylaşmayın.</p>
                    
                    <a href="https://kaptaze.com/restaurant-login.html" class="button">
                        🚀 Panele Giriş Yap
                    </a>
                    
                    <h4>📋 Sonraki Adımlar:</h4>
                    <ul>
                        <li>Restoran profilinizi tamamlayın</li>
                        <li>Menü ve ürünlerinizi ekleyin</li>
                        <li>İşletme saatlerinizi güncelleyin</li>
                        <li>Fotoğraflarınızı yükleyin</li>
                    </ul>
                    
                    <p>Herhangi bir sorunuz varsa bizimle iletişime geçmekten çekinmeyin.</p>
                    
                    <p>İyi çalışmalar dileriz!<br><strong>KapTaze Ekibi</strong></p>
                </div>
                <div class="footer">
                    <p>Bu e-posta otomatik olarak gönderilmiştir. Lütfen yanıtlamayın.</p>
                    <p>© 2025 KapTaze. Tüm hakları saklıdır.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    generateApprovalEmailText(application, credentials) {
        return `
🎉 Başvurunuz Onaylandı! - KapTaze

Sayın ${application.firstName} ${application.lastName},

Tebrikler! ${application.businessName} işletmeniz için yaptığınız başvuru onaylanmıştır.

🔑 Giriş Bilgileriniz:
Kullanıcı Adı: ${credentials.username}
Şifre: ${credentials.password}
Giriş Adresi: https://kaptaze.com/restaurant-login.html

⚠️ Bu bilgileri güvenli bir yerde saklayın ve kimseyle paylaşmayın.

📋 Sonraki Adımlar:
- Restoran profilinizi tamamlayın
- Menü ve ürünlerinizi ekleyin
- İşletme saatlerinizi güncelleyin
- Fotoğraflarınızı yükleyin

İyi çalışmalar dileriz!
KapTaze Ekibi

---
Bu e-posta otomatik olarak gönderilmiştir.
© 2025 KapTaze. Tüm hakları saklıdır.
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
                    <p>KapTaze Restaurant Platform</p>
                </div>
                <div class="content">
                    <div class="rejection-badge">
                        ❌ Maalesef ${application.businessName} başvurunuz şu an için onaylanamamıştır.
                    </div>
                    
                    <p>Sayın <strong>${application.firstName} ${application.lastName}</strong>,</p>
                    
                    <p>KapTaze platformuna olan ilginiz için teşekkür ederiz. Maalesef başvurunuz şu an için onaylanamamıştır.</p>
                    
                    <div class="reason-box">
                        <h4>📝 Red Nedeni:</h4>
                        <p>${reason}</p>
                    </div>
                    
                    <h4>🔄 Tekrar Başvuru</h4>
                    <p>Gerekli düzeltmeleri yaptıktan sonra tekrar başvuruda bulunabilirsiniz. Başvuru sürecinde size yardımcı olmaktan memnuniyet duyarız.</p>
                    
                    <a href="https://kaptaze-frontend.netlify.app/customer-registration-v2.html" class="button">
                        📝 Yeni Başvuru Yap
                    </a>
                    
                    <p>Sorularınız için bizimle iletişime geçebilirsiniz.</p>
                    
                    <p>Saygılarımızla,<br><strong>KapTaze Ekibi</strong></p>
                </div>
                <div class="footer">
                    <p>Bu e-posta otomatik olarak gönderilmiştir. Lütfen yanıtlamayın.</p>
                    <p>© 2025 KapTaze. Tüm hakları saklıdır.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    generateRejectionEmailText(application, reason) {
        return `
📋 Başvuru Durumu - KapTaze

Sayın ${application.firstName} ${application.lastName},

Maalesef ${application.businessName} başvurunuz şu an için onaylanamamıştır.

📝 Red Nedeni:
${reason}

🔄 Gerekli düzeltmeleri yaptıktan sonra tekrar başvuruda bulunabilirsiniz.

Yeni başvuru: https://kaptaze-frontend.netlify.app/customer-registration-v2.html

Saygılarımızla,
KapTaze Ekibi

---
Bu e-posta otomatik olarak gönderilmiştir.
© 2025 KapTaze. Tüm hakları saklıdır.
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
                    <p>KapTaze Restaurant Platform</p>
                </div>
                <div class="content">
                    <div class="welcome-badge">
                        🎉 KapTaze ailesine hoş geldiniz!
                    </div>
                    
                    <p>Sayın <strong>${user.firstName} ${user.lastName}</strong>,</p>
                    
                    <p>KapTaze platformuna hoş geldiniz! Hesabınız başarıyla oluşturuldu ve artık platformumuzun tüm özelliklerinden yararlanabilirsiniz.</p>
                    
                    <p><strong>Hesap Türü:</strong> ${role}</p>
                    <p><strong>E-posta:</strong> ${user.email}</p>
                    
                    <p>Platformumuzda keyifli vakit geçirmenizi dileriz!</p>
                    
                    <p>Saygılarımızla,<br><strong>KapTaze Ekibi</strong></p>
                </div>
                <div class="footer">
                    <p>© 2025 KapTaze. Tüm hakları saklıdır.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    generateWelcomeEmailText(user, isRestaurant) {
        const role = isRestaurant ? 'Restaurant Owner' : 'Admin';
        return `
🌟 Hoş Geldiniz! - KapTaze

Sayın ${user.firstName} ${user.lastName},

KapTaze platformuna hoş geldiniz! Hesabınız başarıyla oluşturuldu.

Hesap Türü: ${role}
E-posta: ${user.email}

Platformumuzda keyifli vakit geçirmenizi dileriz!

Saygılarımızla,
KapTaze Ekibi

© 2025 KapTaze. Tüm hakları saklıdır.
        `;
    }

    generatePasswordResetEmailHTML(user, resetToken) {
        const resetUrl = `https://kaptaze.com/reset-password.html?token=${resetToken}`;
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
                    <p>KapTaze Restaurant Platform</p>
                </div>
                <div class="content">
                    <div class="warning-badge">
                        ⚠️ Şifre sıfırlama talebiniz alındı
                    </div>
                    
                    <p>Sayın <strong>${user.firstName} ${user.lastName}</strong>,</p>
                    
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
                    
                    <p>Saygılarımızla,<br><strong>KapTaze Ekibi</strong></p>
                </div>
                <div class="footer">
                    <p>Bu e-posta otomatik olarak gönderilmiştir. Lütfen yanıtlamayın.</p>
                    <p>© 2025 KapTaze. Tüm hakları saklıdır.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    generatePasswordResetEmailText(user, resetToken) {
        const resetUrl = `https://kaptaze.com/reset-password.html?token=${resetToken}`;
        return `
🔒 Şifre Sıfırlama - KapTaze

Sayın ${user.firstName} ${user.lastName},

Hesabınız için şifre sıfırlama talebinde bulundunuz.

Şifreyi sıfırlamak için: ${resetUrl}

⚠️ Güvenlik Uyarısı:
- Bu link 24 saat geçerlidir
- Link yalnızca bir kez kullanılabilir
- Eğer bu talebi siz yapmadıysanız, bu e-postayı görmezden gelin

Saygılarımızla,
KapTaze Ekibi

---
Bu e-posta otomatik olarak gönderilmiştir.
© 2025 KapTaze. Tüm hakları saklıdır.
        `;
    }
}

module.exports = EmailService;