# KapTaze E-posta Yapılandırma Kılavuzu

## 🚀 Hızlı Başlangıç (Gmail)

### 1. Gmail Hesabı Oluşturma
- `kaptaze.notifications@gmail.com` veya benzeri bir hesap oluşturun
- 2 Faktörlü Doğrulama (2FA) açın

### 2. Uygulama Şifresi Alma
1. Google Hesap Ayarları → Güvenlik
2. 2 Adımlı Doğrulama → Uygulama şifreleri
3. "Mail" seçin ve şifre oluşturun
4. 16 haneli şifreyi kopyalayın

### 3. .env Dosyası Güncelleme
```env
# Gmail Ayarları
EMAIL_USER=kaptaze.notifications@gmail.com
EMAIL_PASS=xxxx xxxx xxxx xxxx  # Uygulama şifresi (boşluksuz)
```

## 📧 Kurumsal E-posta Geçişi

### Yandex Mail for Domain (Önerilen - Uygun Fiyat)
1. Yandex Connect'e kayıt: connect.yandex.com
2. Domain ekleme ve doğrulama
3. DNS kayıtları:
```
MX: mx.yandex.net (öncelik: 10)
TXT: v=spf1 redirect=_spf.yandex.net
```

### Google Workspace
1. workspace.google.com'dan kayıt
2. Domain doğrulama
3. MX kayıtları güncelleme

### .env Dosyası (Kurumsal)
```env
# Kurumsal Mail Ayarları
SMTP_HOST=smtp.yandex.com.tr  # veya smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
EMAIL_USER=siparis@kaptaze.com
EMAIL_PASS=your-password
```

## 📊 Mail Servisleri Karşılaştırma

| Özellik | Gmail | Yandex 360 | Google Workspace | SendGrid |
|---------|-------|------------|------------------|----------|
| **Fiyat** | Ücretsiz | ₺35/ay | ₺75/ay | $20/ay |
| **Mail Limiti** | 500/gün | Limitsiz | Limitsiz | 40K/ay |
| **Kurulum** | 5 dakika | 1 gün | 1 gün | 2 saat |
| **Profesyonellik** | Düşük | Yüksek | Yüksek | Yüksek |
| **API Desteği** | Hayır | Hayır | Evet | Evet |

## 🔧 Tavsiye Edilen Geçiş Planı

### Faz 1: Başlangıç (0-1 Ay)
✅ Gmail ile başla
- Hızlı kurulum
- Test ve geliştirme için ideal
- Maliyet: ₺0

### Faz 2: Profesyonelleşme (1-3 Ay)
✅ Yandex Mail for Domain
- siparis@kaptaze.com
- bilgi@kaptaze.com
- destek@kaptaze.com
- Maliyet: ₺35/ay

### Faz 3: Ölçeklendirme (3+ Ay)
✅ SendGrid veya AWS SES
- API entegrasyonu
- Mail takip ve analitik
- Bounce/complaint yönetimi
- Maliyet: Kullanıma göre

## 📝 Önemli Notlar

1. **SPF, DKIM, DMARC kayıtları** kurumsal mailde zorunlu
2. **Gmail günlük limiti** 500 mail (yeterli başlangıç için)
3. **Kurumsal mail** müşteri güvenini artırır
4. **SendGrid/AWS SES** büyük hacimler için ideal

## 🎯 Sonuç ve Öneri

**Hemen:** Gmail ile başlayın (5 dakikada hazır)
**2 Hafta içinde:** Yandex 360 kurun (profesyonel ve uygun fiyat)
**İleride:** SendGrid entegrasyonu (ölçeklenebilirlik)

## 🆘 Destek

Sorularınız için: dev@kaptaze.com