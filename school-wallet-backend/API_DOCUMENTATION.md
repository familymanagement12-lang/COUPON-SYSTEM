# Authentication Module - API Documentation

## Overview

The Authentication Module handles user registration, login, and token management for the School Digital Coupon Wallet System. It supports multiple user roles: Admin, Parent, Student, and Vendor.

## Authentication Architecture

- **Authentication Method**: JWT (JSON Web Tokens)
- **Token Storage**: Access and Refresh tokens
- **Access Token Expiration**: 7 days (configurable)
- **Refresh Token Expiration**: 30 days (configurable)
- **Security**: Bearer token in Authorization header

## Endpoints

### 1. User Registration

**Endpoint**: `POST /api/auth/register`

**Description**: Register a new user account

**Request Body**:
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "phone": "+233XXXXXXXXXX",
  "password": "SecurePassword123",
  "confirmPassword": "SecurePassword123",
  "role": "parent",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Query Parameters**: None

**Required Fields**:
- `username` (string) - Unique username (3-255 characters)
- `email` (string) - Unique email address
- `password` (string) - Minimum 8 characters
- `confirmPassword` (string) - Must match password
- `role` (string) - One of: `admin`, `parent`, `student`, `vendor`

**Optional Fields**:
- `phone` (string) - Phone number
- `firstName` (string) - First name (required for parent/student)
- `lastName` (string) - Last name (required for parent/student)

**Success Response** (201 Created):
```json
{
  "status": "success",
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": 1,
      "username": "john_doe",
      "email": "john@example.com",
      "role": "parent"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  },
  "timestamp": "2026-07-01T10:30:00Z"
}
```

**Error Responses**:
- `400 Bad Request` - Missing fields or validation error
- `400 Bad Request` - Email already registered
- `400 Bad Request` - Username already taken
- `500 Internal Server Error` - Server error

---

### 2. User Login

**Endpoint**: `POST /api/auth/login`

**Description**: Authenticate user and receive tokens

**Request Body**:
```json
{
  "identifier": "john@example.com",
  "password": "SecurePassword123"
}
```

**Query Parameters**: None

**Required Fields**:
- `identifier` (string) - Email address or username
- `password` (string) - User password

**Success Response** (200 OK):
```json
{
  "status": "success",
  "message": "Login successful",
  "data": {
    "user": {
      "id": 1,
      "username": "john_doe",
      "email": "john@example.com",
      "phone": "+233XXXXXXXXXX",
      "role": "parent",
      "parentId": 1
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  },
  "timestamp": "2026-07-01T10:30:00Z"
}
```

**Error Responses**:
- `400 Bad Request` - Missing identifier or password
- `401 Unauthorized` - Invalid credentials
- `401 Unauthorized` - User account is inactive

---

### 3. Refresh Access Token

**Endpoint**: `POST /api/auth/refresh-token`

**Description**: Get a new access token using refresh token

**Request Body**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Query Parameters**: None

**Required Fields**:
- `refreshToken` (string) - Valid refresh token

**Success Response** (200 OK):
```json
{
  "status": "success",
  "message": "Token refreshed",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "timestamp": "2026-07-01T10:30:00Z"
}
```

**Error Responses**:
- `400 Bad Request` - Refresh token is required
- `401 Unauthorized` - Invalid or expired refresh token
- `401 Unauthorized` - User no longer exists

---

### 4. Logout

**Endpoint**: `POST /api/auth/logout`

**Description**: Logout user and invalidate session

**Headers**:
```
Authorization: Bearer <access_token>
```

**Request Body**: Empty

**Success Response** (200 OK):
```json
{
  "status": "success",
  "message": "Logged out successfully",
  "data": null,
  "timestamp": "2026-07-01T10:30:00Z"
}
```

**Error Responses**:
- `401 Unauthorized` - Access token required
- `401 Unauthorized` - Invalid or expired access token

---

### 5. Get Current User Profile

**Endpoint**: `GET /api/auth/me`

**Description**: Retrieve authenticated user's profile information

**Headers**:
```
Authorization: Bearer <access_token>
```

**Query Parameters**: None

**Success Response** (200 OK):
```json
{
  "status": "success",
  "message": "User profile retrieved",
  "data": {
    "id": 1,
    "username": "john_doe",
    "email": "john@example.com",
    "phone": "+233XXXXXXXXXX",
    "role": "parent",
    "status": "active",
    "created_at": "2026-07-01T10:00:00Z",
    "updated_at": "2026-07-01T10:00:00Z",
    "parentData": {
      "id": 1,
      "first_name": "John",
      "last_name": "Doe",
      "relationship": "Father"
    },
    "children": [
      {
        "id": 1,
        "student_id": "STU1234567890",
        "first_name": "Jane",
        "last_name": "Doe",
        "class": "Form 1",
        "status": "active"
      }
    ]
  },
  "timestamp": "2026-07-01T10:30:00Z"
}
```

**Error Responses**:
- `401 Unauthorized` - Access token required
- `404 Not Found` - User not found

---

### 6. Change Password

**Endpoint**: `POST /api/auth/change-password`

**Description**: Change user password

**Headers**:
```
Authorization: Bearer <access_token>
```

**Request Body**:
```json
{
  "currentPassword": "OldPassword123",
  "newPassword": "NewPassword456",
  "confirmPassword": "NewPassword456"
}
```

**Required Fields**:
- `currentPassword` (string) - Current password for verification
- `newPassword` (string) - New password (minimum 8 characters)
- `confirmPassword` (string) - Must match newPassword

**Success Response** (200 OK):
```json
{
  "status": "success",
  "message": "Password changed successfully",
  "data": null,
  "timestamp": "2026-07-01T10:30:00Z"
}
```

**Error Responses**:
- `401 Unauthorized` - Access token required
- `400 Bad Request` - Missing required fields
- `400 Bad Request` - Passwords do not match
- `400 Bad Request` - Password too short
- `401 Unauthorized` - Current password is incorrect

---

## User Roles

### 1. Admin
- Manage schools, students, parents, vendors
- Manage system settings
- View reports
- Freeze and unfreeze wallets
- Access all system features

### 2. Parent
- View student wallet balance
- Top up wallet
- View transactions
- Set spending limits
- Freeze wallet
- Receive alerts

### 3. Student
- Present Student ID or QR Code
- Purchase approved items
- View personal wallet

### 4. Vendor
- Verify student identity
- Process purchases
- View sales history

---

## Authentication Flow

### Step 1: Register User
```bash
POST /api/auth/register
Content-Type: application/json

{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "SecurePassword123",
  "confirmPassword": "SecurePassword123",
  "role": "parent",
  "firstName": "John",
  "lastName": "Doe"
}
```

### Step 2: Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "identifier": "john@example.com",
  "password": "SecurePassword123"
}
```

### Step 3: Use Access Token
```bash
GET /api/auth/me
Authorization: Bearer <accessToken>
```

### Step 4: Refresh Token (when access token expires)
```bash
POST /api/auth/refresh-token
Content-Type: application/json

{
  "refreshToken": "<refreshToken>"
}
```

---

## Security Considerations

1. **Password Requirements**:
   - Minimum 8 characters
   - Hashed using bcrypt with 10 salt rounds
   - Never transmitted in plain text

2. **Token Security**:
   - Tokens sent in Authorization header as Bearer tokens
   - Access tokens expire after 7 days
   - Refresh tokens expire after 30 days
   - All tokens are signed with JWT_SECRET

3. **Rate Limiting**:
   - Authentication endpoints limited to 100 requests per 15 minutes
   - Prevents brute force attacks

4. **Audit Logging**:
   - All login/logout events logged
   - IP address recorded with each request
   - Password changes logged

5. **Account Security**:
   - Accounts can be suspended or deactivated
   - Deleted accounts cannot login
   - User status checked on every request

---

## Error Codes

| Code | Message | Cause |
|------|---------|-------|
| 400 | Bad Request | Invalid input or missing fields |
| 401 | Unauthorized | Invalid credentials or expired token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | User or resource not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Internal server error |

---

## Environment Variables

Required in `.env`:
```
JWT_SECRET=
JWT_EXPIRATION=7d
REFRESH_TOKEN_EXPIRATION=30d
DATABASE_URL=
DB_HOST=localhost
DB_PORT=5432
DB_NAME=school_wallet_db
DB_USER=postgres
DB_PASSWORD=
DB_SSL=false
```

Set `JWT_SECRET` to a random value of at least 32 characters. Use either
`DATABASE_URL` or the individual `DB_*` settings.

---

## cURL Examples

### Register
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com",
    "password": "SecurePassword123",
    "confirmPassword": "SecurePassword123",
    "role": "parent"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "john@example.com",
    "password": "SecurePassword123"
  }'
```

### Get Current User
```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <accessToken>"
```

### Refresh Token
```bash
curl -X POST http://localhost:3000/api/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "<refreshToken>"
  }'
```

### Change Password
```bash
curl -X POST http://localhost:3000/api/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "currentPassword": "OldPassword123",
    "newPassword": "NewPassword456",
    "confirmPassword": "NewPassword456"
  }'
```

### Logout
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer <accessToken>"
```

---

## Testing the API

### Using Postman

1. Import the provided Postman collection
2. Set environment variables:
   - `base_url`: http://localhost:3000
   - `accessToken`: (populated after login)
   - `refreshToken`: (populated after login)
3. Run requests in sequence

### Using Thunder Client (VS Code)

1. Install Thunder Client extension
2. Create a new request
3. Set method to POST/GET
4. Set URL to `http://localhost:3000/api/auth/...`
5. Add headers and body as needed

---

## Troubleshooting

### "Access token required"
- Make sure Authorization header is included
- Token format should be: `Bearer <token>`
- Token may have expired

### "Invalid credentials"
- Check username/email spelling
- Ensure password is correct
- Account may be suspended

### "Database connection error"
- Verify PostgreSQL is running
- Check database credentials in .env
- Ensure database exists

### "Rate limit exceeded"
- Wait 15 minutes before retrying
- Or spread requests over time

---

## Next Steps

1. Set up database: `npm run init-db`
2. Start development server: `npm run dev`
3. Test authentication endpoints
4. Implement wallet management module
5. Implement transaction processing
6. Add additional features

---

**Last Updated**: 2026-07-01  
**Version**: 1.0.0  
**Status**: Complete
