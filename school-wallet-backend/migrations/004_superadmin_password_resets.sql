ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  assigned_superadmin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_one_pending_per_user
  ON password_reset_requests(user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_status_created
  ON password_reset_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS password_reset_codes (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES password_reset_requests(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash CHAR(64) NOT NULL UNIQUE,
  generated_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expires_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  verified_at TIMESTAMPTZ,
  reset_grant_hash CHAR(64) UNIQUE,
  grant_expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user_created
  ON password_reset_codes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS password_reset_audit (
  id SERIAL PRIMARY KEY,
  request_id INTEGER REFERENCES password_reset_requests(id) ON DELETE SET NULL,
  subject_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_superadmin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_reset_audit_request_created
  ON password_reset_audit(request_id, created_at DESC);