-- Users table (base table for all user types)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK(role IN ('admin', 'parent', 'student', 'vendor')),
  status VARCHAR(50) DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended', 'deleted')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Students table
CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  student_id VARCHAR(50) UNIQUE NOT NULL,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  class VARCHAR(50),
  date_of_birth DATE,
  qr_code_data TEXT,
  status VARCHAR(50) DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'graduated', 'transferred')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Parents table
CREATE TABLE IF NOT EXISTS parents (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  relationship VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Student-Parent relationships
CREATE TABLE IF NOT EXISTS student_parents (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_id INTEGER NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, parent_id)
);

-- Vendors table
CREATE TABLE IF NOT EXISTS vendors (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  vendor_name VARCHAR(255) NOT NULL,
  vendor_type VARCHAR(100) CHECK(vendor_type IN ('canteen', 'bookshop', 'pharmacy', 'stationery')),
  shop_location VARCHAR(255),
  contact_person VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vendor product categories
CREATE TABLE IF NOT EXISTS vendor_categories (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  category VARCHAR(100) NOT NULL,
  is_allowed BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Wallets table
CREATE TABLE IF NOT EXISTS wallets (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  balance DECIMAL(10, 2) DEFAULT 0.00 CHECK(balance >= 0),
  status VARCHAR(50) DEFAULT 'active' CHECK(status IN ('active', 'frozen', 'closed')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Wallet transactions table
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id SERIAL PRIMARY KEY,
  transaction_id VARCHAR(50) UNIQUE NOT NULL,
  wallet_id INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK(type IN ('topup', 'purchase', 'refund', 'adjustment', 'reversal')),
  description TEXT,
  status VARCHAR(50) DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed', 'reversed')),
  reference_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Purchases table
CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES wallet_transactions(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  amount DECIMAL(10, 2) NOT NULL,
  items_description TEXT,
  status VARCHAR(50) DEFAULT 'completed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment transactions (for payment provider integration)
CREATE TABLE IF NOT EXISTS payment_transactions (
  id SERIAL PRIMARY KEY,
  wallet_transaction_id INTEGER NOT NULL REFERENCES wallet_transactions(id) ON DELETE CASCADE,
  parent_id INTEGER NOT NULL REFERENCES parents(id),
  payment_method VARCHAR(100) NOT NULL CHECK(payment_method IN ('paystack')),
  amount DECIMAL(10, 2) NOT NULL,
  provider_reference VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed', 'cancelled')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Spending limits
CREATE TABLE IF NOT EXISTS spending_limits (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  daily_limit DECIMAL(10, 2),
  weekly_limit DECIMAL(10, 2),
  allowed_categories TEXT, -- JSON array
  blocked_categories TEXT, -- JSON array
  purchase_start_time TIME,
  purchase_end_time TIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL CHECK(type IN ('topup', 'purchase', 'alert', 'freeze', 'system')),
  channel VARCHAR(50) NOT NULL CHECK(channel IN ('sms', 'email', 'push')),
  status VARCHAR(50) DEFAULT 'sent' CHECK(status IN ('pending', 'sent', 'failed')),
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(255) NOT NULL,
  entity_type VARCHAR(100),
  entity_id INTEGER,
  old_value JSONB,
  new_value JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Schools table (for multi-school support in future)
CREATE TABLE IF NOT EXISTS schools (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(20),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_role ON users(role);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);
CREATE INDEX idx_students_user_id ON students(user_id);
CREATE INDEX idx_students_student_id ON students(student_id);
CREATE INDEX idx_wallets_student_id ON wallets(student_id);
CREATE INDEX idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX idx_wallet_transactions_created_at ON wallet_transactions(created_at);
CREATE INDEX idx_purchases_student_id ON purchases(student_id);
CREATE INDEX idx_purchases_vendor_id ON purchases(vendor_id);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
