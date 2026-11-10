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
  "firstName": "John",
  "lastName": "Doe"
}
```

**Query Parameters**: None

**Required Fields**:
- `username` (string) - Unique username (3-32 letters, numbers, dots, underscores, or hyphens)
- `email` (string) - Unique email address
- `password` (string) - Minimum 12 characters and no more than 72 UTF-8 bytes
- `confirmPassword` (string) - Must match password
- `firstName` and `lastName` (string) - Required for self-service parent accounts

**Optional Fields**:
- `phone` (string) - Phone number

Public registration always creates a parent account. A submitted `role` field is
ignored; only the configured super administrator can create accounts with other
roles. User and parent rows are inserted in one database transaction. Email
addresses are unique case-insensitively after applying the versioned migration.

### Super Administrator Management

The configured bootstrap super administrator can manage up to five
super-administrator accounts total from the protected admin portal. Additional
accounts have their own email and password and are stored with the
`super_admin` role; they do not need per-account Render environment variables.

- `GET /api/auth/super-admins` - List super-administrator accounts
- `POST /api/auth/super-admins` - Create a super-administrator account
- `POST /api/auth/super-admins/promote` - Promote an existing active admin account by email

These endpoints require an authenticated super administrator. The create
request requires `username`, `email`, `password`, and `confirmPassword`; the
password must be at least 12 characters. Promotion requires an existing active
admin account's email and preserves its current password. Both operations
enforce the five-account cap. The database migration that adds the
`super_admin` role must be applied before using these endpoints.

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
- `409 Conflict` - Email already registered
- `409 Conflict` - Username already taken
- `500 Internal Server Error` - Server error

### Student Bulk Import

`POST /api/students/import` accepts up to 500 students per request. Each row
requires `firstName` and `lastName`; missing student IDs are generated. Rows
with an existing or repeated student ID, username, or email are skipped
individually, while other valid rows in the batch are imported. The response
includes `count`, `duplicateCount`, and `duplicates` with the original 1-based
row number, student ID when available, and reason. Each row uses a database
savepoint so a uniqueness conflict does not abort the rest of the batch.
Rows matching an existing or earlier imported student by normalized first name,
last name, and class are also skipped. The dashboard sends uploads in sequential
batches of 100 to limit request duration; each API request accepts up to 500.

### Super Administrator Transaction History

`GET /api/transactions/all` returns all wallet transactions to an authenticated
super administrator. Results are ordered newest first and paginated with
`limit` (1-100, default 100) and `offset` (default 0). Each transaction
includes student name and ID, vendor name, transaction description, and
purchase `items_description` when available. The response includes
`totalCount` for pagination. Other roles must continue using the scoped
`GET /api/transactions/history` endpoint.

---

### 2. Forgot Password

**Endpoint**: `POST /api/auth/forgot-password`

**Request Body**:
```json
{ "identifier": "john@example.com" }
```

The identifier may be an email address or username. The API returns the same
success response whether an account exists or not. In production, configure
SMTP (`MAIL_HOST`, `MAIL_PORT`, `MAIL_FROM`, `MAIL_USER`, and `MAIL_PASSWORD`)
and set `FRONTEND_URL` to the HTTPS frontend origin. Reset tokens are stored
only as SHA-256 hashes, expire after 30 minutes, and are invalidated when a new
reset request is created.

### 3. Reset Password

**Endpoint**: `POST /api/auth/reset-password`

**Request Body**:
```json
{
  "token": "<token-from-reset-email>",
  "newPassword": "AnotherSecurePassword123",
  "confirmPassword": "AnotherSecurePassword123"
}
```

The token can be used once. A successful reset invalidates all outstanding
reset links for that account.

---

### 4. User Login

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

### 5. Refresh Access Token

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

### 6. Logout

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

### 7. Get Current User Profile

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

### 8. Change Password

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
- `newPassword` (string) - New password (minimum 12 characters and no more than 72 UTF-8 bytes)
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
   - Minimum 12 characters
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
DATABASE_URL_UNPOOLED=
DB_HOST=localhost
DB_PORT=5432
DB_NAME=school_wallet_db
DB_USER=postgres
DB_PASSWORD=
DB_SSL=false
```

Set `JWT_SECRET` to a random value of at least 32 characters. Use either
`DATABASE_URL` or the individual `DB_*` settings. For Neon, the application
uses the pooled `DATABASE_URL`; schema initialization uses
`DATABASE_URL_UNPOOLED` when available.

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
