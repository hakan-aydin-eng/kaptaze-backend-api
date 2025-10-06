# User Search via API

## 1. Start the Server
```bash
cd C:\Users\hakan\KapTazeApp\kaptaze-backend-api
npm start
```

## 2. Search User via API
```bash
# Search in users
curl -X GET "http://localhost:3001/admin/users?search=rsmcihan@hotmail.com" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Search in applications
curl -X GET "http://localhost:3001/admin/applications?search=rsmcihan@hotmail.com" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## 3. Get Admin Token
First login as admin:
```bash
curl -X POST "http://localhost:3001/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Use the returned token for subsequent requests.