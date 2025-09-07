const nodemailer = require('nodemailer');

// Dinamik email konfigürasyonu - Gmail'den kurumsal mail'e kolay geçiş
const createTransporter = () => {
  // Kurumsal mail için SMTP ayarları
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }
  
  // Gmail fallback (başlangıç için)
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER || 'kaptazebilgi@gmail.com',
      pass: process.env.EMAIL_PASS || 'your-app-password'
    }
  });
};

const transporter = createTransporter();

const sendOrderNotification = async (order, restaurantEmail) => {
  // From adresi kurumsal veya Gmail
  const fromAddress = process.env.SMTP_HOST 
    ? 'KapTaze Sipariş <siparis@kaptaze.com>'
    : process.env.EMAIL_USER || 'KapTaze <kaptaze.notifications@gmail.com>';
    
  const mailOptions = {
    from: fromAddress,
    to: restaurantEmail,
    subject: `🔔 Yeni Sipariş - ${order.customer.name}`,
    replyTo: 'destek@kaptaze.com', // Müşteri desteği için
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
          .order-info { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
          .items { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
          .item { padding: 10px 0; border-bottom: 1px solid #eee; }
          .item:last-child { border-bottom: none; }
          .total { font-size: 18px; font-weight: bold; color: #4CAF50; margin-top: 15px; }
          .button { display: inline-block; padding: 12px 30px; background: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🍽️ Yeni Sipariş Geldi!</h1>
          </div>
          <div class="content">
            <div class="order-info">
              <h2>Müşteri Bilgileri</h2>
              <p><strong>Ad Soyad:</strong> ${order.customer.name}</p>
              <p><strong>Telefon:</strong> ${order.customer.phone}</p>
              <p><strong>Adres:</strong> ${order.customer.address}</p>
              ${order.notes ? `<p><strong>Not:</strong> ${order.notes}</p>` : ''}
            </div>
            
            <div class="items">
              <h2>Sipariş Detayları</h2>
              ${order.items.map(item => `
                <div class="item">
                  <strong>${item.quantity}x ${item.name}</strong>
                  <span style="float: right;">₺${item.total.toFixed(2)}</span>
                </div>
              `).join('')}
              <div class="total">
                Toplam: ₺${order.totalAmount.toFixed(2)}
              </div>
            </div>
            
            <p><strong>Ödeme Yöntemi:</strong> ${
              order.paymentMethod === 'cash' ? 'Nakit' :
              order.paymentMethod === 'card' ? 'Kredi Kartı' : 'Online'
            }</p>
            
            <center>
              <a href="${process.env.FRONTEND_URL}/restaurant-panel.html" class="button">
                Panele Git
              </a>
            </center>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully');
  } catch (error) {
    console.error('Email sending failed:', error);
  }
};

module.exports = { sendOrderNotification };