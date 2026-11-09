# Authentication Module Implementation Guide

## ✅ Completed Components

The Authentication Module has been fully implemented with the following features:

### 1. Database Configuration & Schema
- **File**: `src/config/database.js` - PostgreSQL connection pool
- **File**: `src/config/migrations.sql` - Complete database schema
- **Features**:
  - Connection pooling for better performance
  - Comprehensive error handling
  - All required tables with proper relationships
  - Indexes for query optimization

### 2. Database Models
- **User Model** (`src/models/User.js`)
  - User creation with password hashing
  - Find by ID, email, username, phone
  - Password verification and update
  - User update and deletion
  - Find by role

- **Student Model** (`src/models/Student.js`)
  - Student registration and management
  - QR code generation
  - Parent assignment
  - Student suspension/activation
  - Academic tracking

- **Parent Model** (`src/models/Parent.js`)
  - Parent registration
  - Child management
  - Family relationships
  - Profile updates

- **Vendor Model** (`src/models/Vendor.js`)
  - Vendor registration and management
  - Category management
  - Shop location tracking
  - Status management

### 3. Authentication Utilities
- **JWT Utility** (`src/utils/jwt.js`)
  - Token generation (access + refresh)
  - Token verification
  - Token extraction from headers
  - Token decoding

- **Response Handler** (`src/utils/response.js`)
  - Standard API response formatting
  - Success and error responses
  - HTTP status code handling

### 4. Authentication Middleware
- **Auth Middleware** (`src/middleware/auth.js`)
  - `authenticateToken` - Verify JWT and attach user to request
  - `authorizeRole` - Role-based access control
  - `optionalAuth` - Optional token verification
  - `rateLimiter` - API rate limiting (100 requests per 15 minutes)

### 5. Authentication Controller
- **AuthController** (`src/controllers/AuthController.js`)
  - **register** - User registration with role-specific setup
  - **login** - User authentication with token generation
  - **refreshToken** - Token refresh for expired access tokens
  - **logout** - User logout with audit logging
  - **getCurrentUser** - User profile retrieval with role data
  - **changePassword** - Secure password change

### 6. Authentication Routes
- **Auth Routes** (`src/routes/auth.js`)
  - `POST /api/auth/register` - Register new user
  - `POST /api/auth/login` - User login
  - `POST /api/auth/refresh-token` - Refresh access token
  - `POST /api/auth/logout` - User logout
  - `GET /api/auth/me` - Get current user
  - `POST /api/auth/change-password` - Change password

### 7. Database Initialization
- **Init Script** (`scripts/init-db.js`)
  - Automated database schema creation
  - Table validation
  - Error handling for existing tables
  - Connection verification

### 8. Documentation
- **API Documentation** (`API_DOCUMENTATION.md`)
  - Comprehensive endpoint documentation
  - Request/response examples
  - Error handling guide
  - cURL examples
  - Postman setup instructions

---

## 🚀 Getting Started

### Prerequisites
1. Node.js v16+ installed
2. PostgreSQL 12+ running locally
3. npm or yarn package manager

### Step 1: Install Dependencies
All dependencies are already installed. Run if needed:
```bash
npm install
```

### Step 2: Configure Environment
```bash
# Copy the example .env file
cp .env.example .env

# Edit .env with your settings
# Key variables to configure:
# - DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
# - JWT_SECRET (generate a secure random string)
# - NODE_ENV (development/production)
```

### Step 3: Initialize Database
```bash
npm run init-db
```

This will:
- Create all tables
- Set up relationships
- Create indexes
- Initialize the database schema

### Step 4: Start Development Server
```bash
npm run dev
```

Server will start on http://localhost:3000

---

## 📚 Project Structure

```
school-wallet-backend/
├── src/
│   ├── config/
│   │   ├── database.js              # Database connection
│   │   └── migrations.sql           # Database schema
│   ├── controllers/
│   │   └── AuthController.js        # Authentication logic
│   ├── middleware/
│   │   └── auth.js                  # JWT & role middleware
│   ├── models/
│   │   ├── User.js                  # User model
│   │   ├── Student.js               # Student model
│   │   ├── Parent.js                # Parent model
│   │   └── Vendor.js                # Vendor model
│   ├── routes/
│   │   └── auth.js                  # Auth routes
│   ├── services/                    # (for future modules)
│   └── utils/
│       ├── jwt.js                   # JWT utilities
│       └── response.js              # Response formatting
├── scripts/
│   └── init-db.js                   # Database initialization
├── index.js                         # Main entry point
├── package.json                     # Dependencies
├── .env.example                     # Environment template
├── API_DOCUMENTATION.md             # API docs
└── README.md                        # Project overview
```

---

## 🔑 Key Features

### 1. Secure Authentication
- ✅ Password hashing with bcrypt (10 salt rounds)
- ✅ JWT tokens with expiration
- ✅ Refresh token rotation
- ✅ Role-based access control

### 2. User Management
- ✅ Multiple user roles (Admin, Parent, Student, Vendor)
- ✅ Account status tracking (active, inactive, suspended, deleted)
- ✅ Role-specific profile data
- ✅ User relationships (parents-children, vendors)

### 3. Security
- ✅ Rate limiting (100 requests per 15 minutes)
- ✅ Helmet.js security headers
- ✅ CORS protection
- ✅ Audit logging
- ✅ Password change tracking

### 4. Token Management
- ✅ Access tokens (7 days expiration)
- ✅ Refresh tokens (30 days expiration)
- ✅ Token verification on each request
- ✅ Automatic user lookup from token

### 5. Database Features
- ✅ Connection pooling
- ✅ Query logging
- ✅ Error handling
- ✅ Relationship management
- ✅ Index optimization

---

## 🧪 Testing Endpoints

### 1. Register a New User (Parent)
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "parent_user",
    "email": "parent@example.com",
    "phone": "+233XXXXXXXXXX",
    "password": "SecurePassword123",
    "confirmPassword": "SecurePassword123",
    "role": "parent",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

### 2. Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "parent@example.com",
    "password": "SecurePassword123"
  }'
```

Save the `accessToken` and `refreshToken` from response.

### 3. Get Current User
```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

### 4. Refresh Token
```bash
curl -X POST http://localhost:3000/api/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "<REFRESH_TOKEN>"
  }'
```

### 5. Change Password
```bash
curl -X POST http://localhost:3000/api/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{
    "currentPassword": "SecurePassword123",
    "newPassword": "NewPassword456",
    "confirmPassword": "NewPassword456"
  }'
```

### 6. Logout
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

---

## 🔒 Security Best Practices

1. **Environment Variables**
   - Store sensitive data in `.env` file
   - Never commit `.env` to version control
   - Use strong JWT_SECRET (minimum 32 characters)

2. **Password Policy**
   - Minimum 8 characters
   - Passwords hashed with bcrypt
   - Never stored in plain text

3. **Token Security**
   - Access tokens short-lived (7 days)
   - Refresh tokens for token rotation
   - Always use HTTPS in production
   - Include token in Authorization header

4. **Rate Limiting**
   - 100 requests per 15 minutes
   - Prevents brute force attacks
   - IP-based limiting

5. **Audit Logging**
   - All login/logout events logged
   - User IP address recorded
   - Password changes tracked
   - Admin actions logged

---

## 🚨 Common Issues & Solutions

### Issue: "Database connection failed"
**Solution**: 
- Ensure PostgreSQL is running
- Check database credentials in `.env`
- Verify database name exists

### Issue: "Invalid credentials"
**Solution**:
- Double-check username/email and password
- Ensure account is not suspended
- Try with email instead of username

### Issue: "Access token required"
**Solution**:
- Include Authorization header
- Format: `Authorization: Bearer <token>`
- Check token hasn't expired

### Issue: "Too many requests"
**Solution**:
- Wait 15 minutes or use different IP
- Increase rate limit in `src/middleware/auth.js`

### Issue: "Port 3000 already in use"
**Solution**:
- Change PORT in `.env` file
- Or kill process using port 3000

---

## 📊 Database Tables

### Users Table
- Core authentication data
- All user types (admin, parent, student, vendor)
- Status tracking

### Students Table
- Student profiles
- Academic information
- QR code data

### Parents Table
- Parent/guardian information
- Relationship tracking

### Vendors Table
- Vendor business information
- Shop categories
- Location tracking

### Student-Parents Table
- Many-to-many relationships
- Family connections

### Audit Logs Table
- All user actions logged
- Login/logout tracking
- IP address recording

---

## 🎯 Next Steps

### Immediate
1. ✅ Setup database: `npm run init-db`
2. ✅ Start server: `npm run dev`
3. ✅ Test endpoints using provided cURL examples

### Short Term (Week 1)
1. Implement Wallet Management Module
2. Implement Top-Up Module
3. Set up payment gateway integration

### Medium Term (Week 2-3)
1. Implement Purchase Processing Module
2. Implement Transaction Module
3. Implement Notification Module

### Long Term (Month 2)
1. Implement Spending Control Module
2. Implement Reporting Module
3. Implement Vendor Management

---

## 📧 Support

For issues or questions:
1. Check API_DOCUMENTATION.md
2. Review error messages carefully
3. Check database logs
4. Consult PostgreSQL documentation

---

## 📝 Environment Configuration Reference

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=school_wallet_db
DB_USER=postgres
DB_PASSWORD=password
DB_SSL=false

# JWT
JWT_SECRET=your_super_secret_key_min_32_chars_long
JWT_EXPIRATION=7d
REFRESH_TOKEN_EXPIRATION=30d

# (Future: Payment gateways, SMS, Email)
```

---

**Implementation Date**: 2026-07-01  
**Version**: 1.0.0  
**Status**: ✅ Complete and Ready for Testing
