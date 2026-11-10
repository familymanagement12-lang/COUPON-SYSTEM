# School Digital Coupon Wallet System - Backend

A cashless payment platform that allows parents to deposit funds into a student's digital wallet. Students can then use their Student ID or QR code to purchase items from approved school vendors.

## 🎯 Features

- **Authentication**: Secure login for parents, students, vendors, and admins
- **Wallet Management**: Create, manage, and track digital wallets
- **Top-Up System**: Support for multiple payment methods (MTN Mobile Money, Telecel Cash, AirtelTigo Cash)
- **Purchase Processing**: Vendor verification and transaction processing
- **Spending Controls**: Daily/weekly limits and category restrictions
- **Notifications**: SMS and Email alerts for transactions
- **Reporting**: Comprehensive financial and usage reports
- **Security**: JWT authentication, role-based access control, audit logging

## 🛠️ Tech Stack

- **Framework**: Express.js (Node.js)
- **Database**: PostgreSQL
- **Authentication**: JWT (jsonwebtoken)
- **Security**: Helmet, CORS, Bcrypt
- **QR Code**: qrcode library
- **Real-time**: Socket.io
- **Development**: Nodemon

## 📦 Installation

### Prerequisites

- Node.js (v18+)
- npm or yarn
- PostgreSQL (v12+)

### Setup Steps

1. **Clone the repository**
```bash
git clone <repository-url>
cd school-wallet-backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
- Database credentials
- JWT secret
- Payment provider API keys
- Email/SMS configuration

For the linked Neon project, pull local Postgres settings with
`neon env pull --services postgres --file .env.local`. The backend loads
`.env.local` before `.env`; this local file is ignored by Git. The app uses
Neon's pooled `DATABASE_URL`, falling back to `DATABASE_URL_UNPOOLED` when the
pooled URL is not configured. Database initialization and migrations prefer
`DATABASE_URL_UNPOOLED` for direct connections.

4. **Create the database schema**
```bash
npm run init-db
npm run migrate
```

`npm run migrate` applies versioned, additive database changes in a transaction.
It serializes concurrent migration runs and records each migration so it is safe
to rerun. The email uniqueness migration preserves all rows and stops if
existing email addresses normalize to the same value after trimming and
lowercasing; review any reported
duplicates manually before retrying.

The backend runs this same migration runner before opening its HTTP listener.
It prefers `DATABASE_URL_UNPOOLED` for migrations and falls back to
`DATABASE_URL` (including Neon's pooled URL) or the `DB_*` connection settings.
Each migration and its tracking record commit together; a failed migration is
rolled back and prevents the server from starting. The transaction-scoped
PostgreSQL advisory lock serializes startup and manual migration runs across
multiple backend instances.

5. **Start development server**
```bash
npm run dev
```

The server will run on `http://localhost:3000`

## Deploying to Render

1. Create a Render PostgreSQL database and a Node web service rooted at
   `school-wallet-backend`. Use `npm install` as the build command and
   `npm start` as the start command; set the health check path to
   `/api/health`.
2. Set `NODE_ENV=production`, `DATABASE_URL` to the database's pooled
   connection string, and `DATABASE_URL_UNPOOLED` to its direct connection
   string when available. The runtime can use the direct URL if the pooled
   variable is absent. Set `DB_SSL=false` unless your database connection
   requires TLS, and use a random `JWT_SECRET` of at least 32 characters.
3. Set `FRONTEND_URL` to the deployed frontend's HTTPS origin. Set
   `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` to the intended administrator
   account; use these only as secrets in Render. Configure `MAIL_HOST`,
   `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASSWORD`, and `MAIL_FROM`
   with your SMTP provider to enable password reset emails. Do not put SMTP
   credentials in frontend variables.
4. Create a Static Site rooted at `school-wallet-frontend`, build with
   `npm install && npm run build`, publish `dist`, and set `VITE_API_URL` to
   `https://<backend-host>/api`. Set `VITE_SUPER_ADMIN_EMAIL` to the same value
   as `SUPER_ADMIN_EMAIL`. Add a rewrite from `/*` to `/index.html`.
   After the frontend URL is assigned, confirm it is set exactly in the
   backend's `FRONTEND_URL`.
5. On each backend start, pending versioned migrations are applied before
   `/api/health` or other routes can accept requests. No Render Shell step is
   needed for these migrations. For a new empty database, initialize the base
   schema with `npm run init-db` before the first deployment; keep
   `npm run migrate` available for manual, repeatable migration runs. The
   configured `SUPER_ADMIN_EMAIL` remains the bootstrap super-admin; the
   migrations do not create accounts, change passwords, or alter administrator
   permissions. The bootstrap admin can create up to four additional super
   admins from the portal, using their own email and password without
   individual Render environment variables.
6. Configure the payment provider's live credentials only after successful
   test-mode top-ups and reconciliation. Point its webhook to
   `https://<backend-host>/api/topups/webhook`.

Before accepting real payments, verify the live webhook signature, payment
amount, wallet balance, refunds/reversals, and settlement process with the
payment provider and school finance team.

## 🚀 Running the Project

### Development
```bash
npm run dev
```
Runs with auto-reload using nodemon.

### Production
```bash
npm start
```

### Health Check
```bash
curl http://localhost:3000/api/health
```

## 📚 Project Structure

```
school-wallet-backend/
├── src/
│   ├── config/          # Configuration files
│   ├── controllers/      # Request handlers
│   ├── middleware/       # Express middleware
│   ├── models/           # Database models
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   └── utils/            # Utility functions
├── .env.example          # Environment template
├── .gitignore            # Git ignore rules
├── index.js              # Entry point
├── package.json          # Project metadata
└── README.md             # This file
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh-token` - Refresh JWT token

### Students
- `GET /api/students/:id` - Get student profile
- `GET /api/students/:id/wallet` - Get student wallet
- `GET /api/students/:id/transactions` - Get student transactions

### Wallets
- `POST /api/wallets` - Create wallet
- `GET /api/wallets/:id` - Get wallet details
- `POST /api/wallets/:id/credit` - Credit wallet
- `POST /api/wallets/:id/debit` - Debit wallet
- `POST /api/wallets/:id/freeze` - Freeze wallet

### Transactions
- `GET /api/transactions` - List transactions
- `POST /api/transactions` - Create transaction
- `GET /api/transactions/:id` - Get transaction details

### Vendors
- `POST /api/vendors/verify-student` - Verify student
- `POST /api/vendors/process-purchase` - Process purchase

### Reports
- `GET /api/reports/dashboard` - Dashboard statistics
- `GET /api/reports/transactions` - Transaction reports
- `GET /api/reports/vendors` - Vendor reports

## 🔐 Security Features

- Password hashing with bcrypt
- JWT authentication
- Role-based access control (RBAC)
- API rate limiting
- Audit logging
- Transaction verification
- Secure database backups
- HTTPS support

## 📝 Database Tables

Core tables (coming in migration scripts):
- `users` - System users
- `students` - Student records
- `parents` - Parent/guardian records
- `vendors` - Vendor information
- `wallets` - Student wallets
- `wallet_transactions` - Transaction history
- `purchases` - Purchase records
- `payment_transactions` - Payment provider transactions
- `notifications` - User notifications
- `audit_logs` - System audit logs
- `spending_limits` - Spending limit configurations

## 🧪 Testing

Run `npm test` for backend authentication tests. They use isolated database
stubs and do not create or alter production accounts.

## 📖 API Documentation

Full API documentation available at `/api/docs` (Swagger setup coming soon)

## 🐛 Troubleshooting

### Port already in use
Change the `PORT` in your `.env` file

### Database connection error
Verify PostgreSQL is running and credentials in `.env` are correct

### Missing environment variables
Copy `.env.example` to `.env` and fill in required values

## 📧 Support

For issues and questions, please create an issue in the repository.

## 📄 License

ISC License - see package.json

## 👥 Contributors

- Development team

---

**Version**: 1.0.0  
**Last Updated**: 2026-06-28
