# 🚀 KapTaze Backend API

Professional restaurant management system backend API built with Express.js and MongoDB Atlas.

## 🌟 Features

- **JWT Authentication & Authorization**
- **MongoDB Atlas Integration** 
- **Professional Email System** (SendGrid)
- **Rate Limiting & Security** (Helmet.js, CORS)
- **Input Validation** (express-validator)
- **Professional Error Handling**
- **Production Ready** with custom domain support

## 📋 API Endpoints

### Authentication
- `POST /auth/admin/login` - Admin login
- `POST /auth/restaurant/login` - Restaurant login
- `GET /auth/me` - Get current user
- `POST /auth/logout` - Logout

### Public
- `POST /public/applications` - Submit restaurant application
- `GET /health` - Health check

### Admin (Requires admin JWT)
- `GET /admin/applications` - List applications with filtering
- `GET /admin/applications/:id` - Get application details
- `POST /admin/applications/:id/approve` - Approve application
- `POST /admin/applications/:id/reject` - Reject application
- `GET /admin/restaurants` - List restaurants

### Restaurant (Requires restaurant JWT)
- `GET /restaurant/profile` - Get restaurant profile
- `PATCH /restaurant/profile` - Update restaurant profile

## 🛠️ Tech Stack

- **Node.js** + **Express.js**
- **MongoDB** with **Mongoose ODM**
- **JWT** for authentication
- **bcrypt** for password hashing
- **SendGrid** for email service
- **express-validator** for input validation
- **helmet** for security headers
- **cors** for cross-origin requests

## 🚀 Production Deployment

### Environment Variables

```env
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your-secure-jwt-secret
FRONTEND_URLS=https://kaptaze.com,https://www.kaptaze.com
SENDGRID_API_KEY=your-sendgrid-api-key
FROM_EMAIL=noreply@kaptaze.com
```

### Render.com Deployment

1. Connect GitHub repository
2. Use `render.yaml` configuration
3. Custom domain: `api.kaptaze.com`
4. SSL automatically configured

## 📧 Email Templates

Professional HTML email templates included:
- Application approval with login credentials
- Application rejection with feedback
- Welcome messages
- Password reset (future)

## 🔒 Security Features

- **Rate Limiting**: 50 requests per 15 minutes
- **CORS**: Restricted to known domains
- **JWT Expiration**: 24 hours in production
- **Password Hashing**: bcrypt with 12 rounds
- **Input Validation**: All endpoints validated
- **Security Headers**: Helmet.js implemented

## 🧪 Testing

### Local Development
```bash
npm install
npm run dev
```

### API Health Check
```bash
curl https://api.kaptaze.com/health
```

### Admin Login Test
```bash
curl -X POST https://api.kaptaze.com/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

## 📊 Database Schema

### User Model
- Authentication (username, password, email)
- Role-based access (admin, restaurant)
- Account locking for security
- Last login tracking

### Application Model  
- Restaurant application data
- Status tracking (pending, approved, rejected)
- Auto-generated application IDs
- Admin review tracking

### Restaurant Model
- Business profile information
- Owner details and contact
- Location data with coordinates
- Status management

## 🤖 Generated with Claude Code

This project was developed using Claude Code, demonstrating professional full-stack development capabilities with modern best practices.

---

**🌟 Production URL**: https://api.kaptaze.com  
**🏠 Frontend**: https://kaptaze.com  
**📊 Database**: MongoDB Atlas