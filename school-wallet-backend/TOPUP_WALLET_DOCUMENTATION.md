# Top-Up Module & Wallet Management Documentation

## Overview

The Top-Up Module enables parents to deposit funds into student wallets using multiple payment providers. The Wallet Management Module provides complete wallet operations including balance checks, freezing, and transaction history.

## Payment Providers Supported

### 1. MTN Mobile Money
- Provider: MTN Ghana
- Currency: GHS
- Minimum Amount: GHS 1
- Maximum Amount: GHS 10,000
- Transaction Fee: 1.95%
- Status: Requires API Configuration

### 2. Telecel Cash
- Provider: Telecel Ghana
- Currency: GHS
- Minimum Amount: GHS 1
- Maximum Amount: GHS 10,000
- Transaction Fee: 2.5%
- Status: Requires API Configuration

### 3. AirtelTigo Cash
- Provider: AirtelTigo Ghana
- Currency: GHS
- Minimum Amount: GHS 1
- Maximum Amount: GHS 10,000
- Transaction Fee: 2.0%
- Status: Requires API Configuration

---

## API Endpoints

### Payment Methods

#### Get Available Payment Methods

**Endpoint**: `GET /api/topups/methods`

**Description**: Get list of available payment gateways

**Headers**: None required

**Query Parameters**: None

**Success Response** (200 OK):
```json
{
  "status": "success",
  "message": "Available payment methods",
  "data": {
    "count": 3,
    "methods": [
      {
        "name": "MTN Mobile Money",
        "provider": "MTN",
        "environment": "sandbox",
        "supported_currencies": ["GHS"],
        "min_amount": 1,
        "max_amount": 10000,
        "fee_percentage": 1.95,
        "fee_fixed": 0
      },
      {
        "name": "Telecel Cash",
        "provider": "Telecel",
        "environment": "sandbox",
        "supported_currencies": ["GHS"],
        "min_amount": 1,
        "max_amount": 10000,
        "fee_percentage": 2.5,
        "fee_fixed": 0
      },
      {
        "name": "AirtelTigo Cash",
        "provider": "AirtelTigo",
        "environment": "sandbox",
        "supported_currencies": ["GHS"],
        "min_amount": 1,
        "max_amount": 10000,
        "fee_percentage": 2.0,
        "fee_fixed": 0
      }
    ]
  },
  "timestamp": "2026-07-01T10:30:00Z"
}
```

---

### Top-Up Operations

#### Initiate Top-Up

**Endpoint**: `POST /api/topups`

**Description**: Initiate a wallet top-up transaction

**Headers**:
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "studentId": 1,
  "amount": 100.50,
  "paymentMethod": "mtn",
  "description": "Weekly allowance"
}
```

**Required Fields**:
- `studentId` (integer) - ID of student to fund
- `amount` (decimal) - Amount to deposit (1-10,000)
- `paymentMethod` (string) - One of: `mtn`, `telecel`, `airteltigo`

**Optional Fields**:
- `description` (string) - Transaction description

**Success Response** (201 Created):
```json
{
  "status": "success",
  "message": "Top-up initiated",
  "data": {
    "transactionId": 1,
    "paymentReference": "MTN_1688113800000_abc123def",
    "provider": "mtn",
    "amount": 100.50,
    "status": "initiated",
    "paymentData": {
      "referenceId": "MTN_1688113800000_abc123def",
      "externalId": "WALLET_1688113800000"
    }
  },
  "timestamp": "2026-07-01T10:30:00Z"
}
```

**Error Responses**:
- `400 Bad Request` - Missing or invalid fields
- `404 Not Found` - Student not found
- `403 Forbidden` - No permission to fund student
- `503 Service Unavailable` - Payment gateway not configured

---

#### Complete Top-Up (Webhook)

**Endpoint**: `POST /api/topups/complete`

**Description**: Mark top-up as completed (called from payment webhook)

**Headers**:
```
Content-Type: application/json
```

**Request Body**:
```json
{
  "paymentReference": "MTN_1688113800000_abc123def",
  "studentId": 1,
  "amount": 100.50
}
```

**Success Response** (200 OK):
```json
{
  "status": "success",
  "message": "Top-up completed successfully",
  "data": {
    "walletId": 1,
    "studentId": 1,
    "amount": 100.50,
    "newBalance": 500.75,
    "transactionId": "WTX1688113800000",
    "status": "completed",
    "timestamp": "2026-07-01T10:35:00Z"
  },
  "timestamp": "2026-07-01T10:35:00Z"
}
```

---

#### Payment Webhook Callback

**Endpoint**: `POST /api/topups/webhook`

**Description**: Receive payment provider webhook notifications

**Headers**:
```
Content-Type: application/json
X-Webhook-Signature: <signature>
```

**Request Body** (Example - MTN):
```json
{
  "provider": "mtn",
  "status": "successful",
  "referenceId": "MTN_1688113800000_abc123def",
  "studentId": 1,
  "amount": 100.50,
  "signature": "hash_of_payload"
}
```

**Success Response** (200 OK):
```json
{
  "status": "success",
  "message": "Webhook processed successfully"
}
```

---

#### Get Top-Up History

**Endpoint**: `GET /api/topups/history`

**Description**: Get top-up transaction history for parent

**Headers**:
```
Authorization: Bearer <access_token>
```

**Query Parameters**:
- `limit` (integer) - Results per page (default: 50, max: 100)
- `offset` (integer) - Pagination offset (default: 0)

**Success Response** (200 OK):
```json
{
  "status": "success",
  "message": "Top-up history retrieved",
  "data": {
    "count": 5,
    "limit": 50,
    "offset": 0,
    "topups": [
      {
        "id": 1,
        "parent_id": 1,
        "payment_method": "mtn",
        "amount": 100.50,
        "provider_reference": "MTN_1688113800000_abc123def",
        "status": "completed",
        "student_id": "STU123456",
        "first_name": "Jane",
        "last_name": "Doe",
        "created_at": "2026-07-01T10:30:00Z"
      }
    ]
  },
  "timestamp": "2026-07-01T10:35:00Z"
}
```

---

#### Get Top-Up Statistics

**Endpoint**: `GET /api/topups/stats`

**Description**: Get top-up statistics for parent

**Headers**:
```
Authorization: Bearer <access_token>
```

**Success Response** (200 OK):
```json
{
  "status": "success",
  "message": "Top-up statistics retrieved",
  "data": {
    "total_topups": 12,
    "successful_topups": 11,
    "failed_topups": 1,
    "pending_topups": 0,
    "total_amount": 1250.00,
    "average_amount": 104.17
  },
  "timestamp": "2026-07-01T10:35:00Z"
}
```

---

## Wallet Endpoints

### Wallet Management

#### Get My Wallet(s)

**Endpoint**: `GET /api/wallets/me`

**Description**: Get wallet(s) for current user (Student or Parent)

**Headers**:
```
Authorization: Bearer <access_token>
```

**Success Response** (200 OK - Student):
```json
{
  "status": "success",
  "message": "Wallet retrieved",
  "data": {
    "id": 1,
    "student_id": 1,
    "balance": 500.75,
    "status": "active",
    "student_id": "STU123456",
    "first_name": "Jane",
    "last_name": "Doe",
    "email": "jane@example.com",
    "phone": "+233XXXXXXXXXX",
    "created_at": "2026-07-01T10:00:00Z"
  }
}
```

**Success Response** (200 OK - Parent):
```json
{
  "status": "success",
  "message": "Student wallets retrieved",
  "data": [
    {
      "id": 1,
      "student_id": 1,
      "balance": 500.75,
      "status": "active",
      "student_id": "STU123456",
      "first_name": "Jane",
      "last_name": "Doe"
    },
    {
      "id": 2,
      "student_id": 2,
      "balance": 300.00,
      "status": "active",
      "student_id": "STU123457",
      "first_name": "John",
      "last_name": "Doe"
    }
  ]
}
```

---

#### Get Wallet by ID

**Endpoint**: `GET /api/wallets/:walletId`

**Description**: Get wallet details

**Headers**:
```
Authorization: Bearer <access_token>
```

**Success Response** (200 OK):
```json
{
  "status": "success",
  "message": "Wallet retrieved",
  "data": {
    "id": 1,
    "student_id": 1,
    "balance": 500.75,
    "status": "active",
    "student_id": "STU123456",
    "first_name": "Jane",
    "last_name": "Doe",
    "email": "jane@example.com",
    "phone": "+233XXXXXXXXXX",
    "created_at": "2026-07-01T10:00:00Z",
    "updated_at": "2026-07-01T10:35:00Z"
  }
}
```

---

#### Get Wallet Balance

**Endpoint**: `GET /api/wallets/:walletId/balance`

**Description**: Get current wallet balance

**Headers**:
```
Authorization: Bearer <access_token>
```

**Success Response** (200 OK):
```json
{
  "status": "success",
  "message": "Wallet balance retrieved",
  "data": {
    "walletId": 1,
    "balance": 500.75,
    "status": "active",
    "currency": "GHS"
  }
}
```

---

#### Get Wallet Statistics

**Endpoint**: `GET /api/wallets/:walletId/stats`

**Description**: Get wallet transaction statistics

**Headers**:
```
Authorization: Bearer <access_token>
```

**Success Response** (200 OK):
```json
{
  "status": "success",
  "message": "Wallet statistics retrieved",
  "data": {
    "id": 1,
    "balance": 500.75,
    "status": "active",
    "total_topups": 12,
    "total_purchases": 45,
    "total_refunds": 2,
    "total_topup_amount": 1250.00,
    "total_purchase_amount": 749.25,
    "last_transaction_date": "2026-07-01T10:35:00Z"
  }
}
```

---

#### Freeze Wallet

**Endpoint**: `POST /api/wallets/:walletId/freeze`

**Description**: Freeze wallet (prevent purchases)

**Headers**:
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "reason": "Suspicious activity detected"
}
```

**Success Response** (200 OK):
```json
{
  "status": "success",
  "message": "Wallet frozen successfully",
  "data": {
    "id": 1,
    "balance": 500.75,
    "status": "frozen",
    "updated_at": "2026-07-01T10:40:00Z"
  }
}
```

---

#### Unfreeze Wallet

**Endpoint**: `POST /api/wallets/:walletId/unfreeze`

**Description**: Unfreeze wallet (Admin only)

**Headers**:
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "reason": "Issue resolved"
}
```

**Success Response** (200 OK):
```json
{
  "status": "success",
  "message": "Wallet unfrozen successfully",
  "data": {
    "id": 1,
    "balance": 500.75,
    "status": "active",
    "updated_at": "2026-07-01T10:45:00Z"
  }
}
```

---

#### Create Wallet (Admin)

**Endpoint**: `POST /api/wallets`

**Description**: Create wallet for student

**Headers**:
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "studentId": 1,
  "initialBalance": 0
}
```

**Success Response** (201 Created):
```json
{
  "status": "success",
  "message": "Wallet created successfully",
  "data": {
    "id": 1,
    "student_id": 1,
    "balance": 0,
    "status": "active",
    "created_at": "2026-07-01T10:00:00Z"
  }
}
```

---

#### Get All Wallets (Admin)

**Endpoint**: `GET /api/wallets`

**Description**: Get all system wallets

**Headers**:
```
Authorization: Bearer <access_token>
```

**Query Parameters**:
- `limit` (integer) - Results per page (default: 50, max: 100)
- `offset` (integer) - Pagination offset (default: 0)

**Success Response** (200 OK):
```json
{
  "status": "success",
  "message": "Wallets retrieved",
  "data": {
    "count": 100,
    "limit": 50,
    "offset": 0,
    "wallets": [
      {
        "id": 1,
        "student_id": 1,
        "balance": 500.75,
        "status": "active",
        "student_id": "STU123456",
        "first_name": "Jane",
        "last_name": "Doe",
        "email": "jane@example.com"
      }
    ]
  }
}
```

---

## Wallet Status

- **Active**: Wallet is functional, can receive top-ups and process purchases
- **Frozen**: Wallet cannot process purchases but can receive top-ups
- **Closed**: Wallet is inactive and locked

---

## Transaction Flow

### Top-Up Flow

```
1. Parent initiates top-up
   ├─ System validates student & parent relationship
   ├─ System checks payment provider availability
   ├─ Payment record created with 'pending' status
   └─ Payment gateway is called

2. Payment provider processes payment
   ├─ User enters PIN/confirms payment
   ├─ Provider processes transaction
   └─ Provider sends webhook notification

3. System receives webhook
   ├─ Webhook signature validated
   ├─ Wallet transaction created
   ├─ Wallet balance updated
   ├─ Status changed to 'completed'
   └─ Parent notified

4. Completion
   └─ Top-up is done, funds available for purchases
```

---

## Error Handling

### Common Errors

| Error | Code | Cause | Solution |
|-------|------|-------|----------|
| Wallet not found | 404 | Student has no wallet | Create wallet in admin panel |
| Insufficient balance | 400 | Wallet balance is too low | Parent must top-up wallet |
| Wallet frozen | 400 | Admin froze the wallet | Contact support/admin |
| Payment failed | 400 | Payment provider rejected payment | Retry or use different method |
| Gateway not configured | 503 | Payment provider API not setup | Configure provider credentials |
| Invalid phone number | 400 | Phone format incorrect | Use format: +233XXXXXXXXXX |
| Amount invalid | 400 | Amount outside allowed range | Use amount between 1-10,000 |

---

## Configuration

### Environment Variables

```env
# MTN Mobile Money
MTN_API_KEY=your_mtn_api_key
MTN_PRIMARY_KEY=your_mtn_primary_key
MTN_SECONDARY_KEY=your_mtn_secondary_key
MTN_SUBSCRIPTION_KEY=your_mtn_subscription_key

# Telecel Cash
TELECEL_API_KEY=your_telecel_api_key
TELECEL_MERCHANT_ID=your_telecel_merchant_id
TELECEL_MERCHANT_KEY=your_telecel_merchant_key

# AirtelTigo Cash
AIRTELTIGO_API_KEY=your_airteltigo_api_key
AIRTELTIGO_CLIENT_ID=your_airteltigo_client_id
AIRTELTIGO_CLIENT_SECRET=your_airteltigo_client_secret

# Callback URL
PAYMENT_CALLBACK_URL=http://localhost:3000/api/topups/webhook
```

---

## Best Practices

1. **Always validate phone numbers** before payment initiation
2. **Implement idempotency** for webhook handling to prevent double-processing
3. **Log all payment transactions** for audit purposes
4. **Retry failed payments** with exponential backoff
5. **Monitor transaction fees** to ensure accuracy
6. **Validate webhook signatures** from all payment providers
7. **Use HTTPS** in production for all payment endpoints
8. **Encrypt sensitive** payment data in database
9. **Implement rate limiting** on top-up endpoints
10. **Test with sandbox** environment before going live

---

## Testing

### Test Top-Up Flow

```bash
# 1. Get available payment methods
curl -X GET http://localhost:3000/api/topups/methods

# 2. Initiate top-up
curl -X POST http://localhost:3000/api/topups \
  -H "Authorization: Bearer <parent_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "studentId": 1,
    "amount": 50,
    "paymentMethod": "mtn"
  }'

# 3. Simulate webhook callback (for testing)
curl -X POST http://localhost:3000/api/topups/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "mtn",
    "status": "successful",
    "referenceId": "MTN_1688113800000_abc123def",
    "studentId": 1,
    "amount": 50
  }'

# 4. Check wallet balance
curl -X GET http://localhost:3000/api/wallets/1/balance \
  -H "Authorization: Bearer <student_token>"
```

---

## Next Steps

1. Implement Purchase Processing Module
2. Implement Transaction History Module
3. Implement Spending Limits Module
4. Implement Notification Module
5. Integrate with live payment providers
6. Implement refund handling

---

**Version**: 1.0.0  
**Last Updated**: 2026-07-01  
**Status**: Complete
