const sgMail = require('@sendgrid/mail');

// SendGrid API key configuration
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

console.log('📧 SendGrid initialized:', process.env.SENDGRID_API_KEY ? 'API Key Set' : 'API Key Missing');

const sendWelcomeEmail = async (userEmail, userName) => {
  console.log('📧 Sending welcome email to:', userEmail);

  const fromAddress = process.env.SENDGRID_FROM_EMAIL || 'bilgi@kapkazan.com';

  const msg = {
    to: userEmail,
    from: {
      email: fromAddress,
      name: 'kapkazan Hoşgeldin'
    },
    subject: '🎉 kapkazan\'a Hoş Geldiniz!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">🎉 Hoş Geldiniz ${userName}!</h2>
        <p>kapkazan ailesine katıldığınız için teşekkür ederiz!</p>
        <p>Artık yakınınızdaki restoranlardan %50'ye varan indirimlerle lezzetli yemeklere ulaşabilirsiniz.</p>
        <p style="color: #16a34a; font-weight: bold;">İyi alışverişler dileriz! 🌱</p>
      </div>
    `
  };

  try {
    await sgMail.send(msg);
    console.log('✅ Welcome email sent successfully to:', userEmail);
    return { success: true };
  } catch (error) {
    console.error('❌ SendGrid welcome email error:', error);
    return { success: false, error: error.message };
  }
};

const sendOrderNotification = async (order, restaurantEmail) => {
  console.log('📧 Starting SendGrid email notification...');
  console.log('📧 SENDGRID_API_KEY:', process.env.SENDGRID_API_KEY ? 'Set' : 'Not set');
  console.log('📧 To:', restaurantEmail);

  // From adresi - SendGrid verified sender
  const fromAddress = process.env.SENDGRID_FROM_EMAIL || 'bilgi@kapkazan.com';

  console.log('📧 From:', fromAddress);

  const msg = {
    to: restaurantEmail,
    from: {
      email: fromAddress,
      name: 'kapkazan Sipariş Sistemi'
    },
    subject: `🔔 Yeni Sipariş - ${order.customer.name}`,
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
          .order-info { 
            background: #f8f9fa; 
            padding: 20px; 
            margin: 20px 0; 
            border-radius: 8px;
            border-left: 4px solid #4CAF50;
          }
          .items { 
            background: white; 
            padding: 20px; 
            margin: 20px 0; 
            border-radius: 8px; 
            border: 1px solid #e9ecef;
          }
          .item { 
            padding: 12px 0; 
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
          }
          .item:last-child { 
            border-bottom: none; 
          }
          .total { 
            font-size: 20px; 
            font-weight: bold; 
            color: #4CAF50; 
            margin-top: 20px; 
            padding-top: 15px;
            border-top: 2px solid #4CAF50;
            text-align: right;
          }
          .button { 
            display: inline-block; 
            padding: 15px 40px; 
            background: linear-gradient(135deg, #4CAF50, #45a049); 
            color: white; 
            text-decoration: none; 
            border-radius: 25px; 
            margin: 25px 0;
            text-align: center;
            font-weight: 500;
            box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3);
          }
          .footer {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #666;
            font-size: 14px;
          }
          h2 {
            color: #4CAF50;
            margin-bottom: 15px;
          }
          .info-row {
            margin: 10px 0;
            font-size: 16px;
          }
          .info-label {
            font-weight: 600;
            color: #555;
          }
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
              <div class="info-row">
                <span class="info-label">Ad Soyad:</span> ${order.customer.name}
              </div>
              <div class="info-row">
                <span class="info-label">Telefon:</span> ${order.customer.phone}
              </div>
              <div class="info-row">
                <span class="info-label">Adres:</span> ${order.customer.address}
              </div>
              ${order.notes ? `<div class="info-row"><span class="info-label">Not:</span> ${order.notes}</div>` : ''}
            </div>
            
            <div class="items">
              <h2>Sipariş Detayları</h2>
              ${order.items.map(item => `
                <div class="item">
                  <span><strong>${item.quantity}x ${item.name}</strong></span>
                  <span>₺${item.total.toFixed(2)}</span>
                </div>
              `).join('')}
              <div class="total">
                Toplam: ₺${order.totalAmount.toFixed(2)}
              </div>
            </div>
            
            <div class="info-row" style="font-size: 16px; margin: 20px 0;">
              <span class="info-label">Ödeme Yöntemi:</span> ${
                order.paymentMethod === 'cash' ? 'Nakit' :
                order.paymentMethod === 'card' ? 'Kredi Kartı' : 'Online'
              }
            </div>
            
            <center>
              <a href="${process.env.FRONTEND_URL || 'https://kapkazan.com'}/restaurant-panel" class="button">
                🍽️ Panele Git ve Siparişi Yönet
              </a>
            </center>
          </div>
          
          <div class="footer">
            <p>kapkazan Sipariş Sistemi | Restoranınız için daha iyi bir deneyim</p>
            <p>Destek: bilgi@kapkazan.com | Web: kapkazan.com</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    console.log('📧 Sending email via SendGrid...');
    await sgMail.send(msg);
    console.log('✅ Email sent successfully via SendGrid');
    return { success: true, message: 'Email sent successfully' };
  } catch (error) {
    console.error('❌ SendGrid email failed:', error);
    if (error.response) {
      console.error('SendGrid response body:', error.response.body);
    }
    return { success: false, error: error.message };
  }
};

module.exports = { sendOrderNotification, sendWelcomeEmail };