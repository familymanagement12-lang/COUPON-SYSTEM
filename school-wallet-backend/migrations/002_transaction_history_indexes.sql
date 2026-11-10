CREATE INDEX IF NOT EXISTS idx_wallet_transactions_student_created_at
  ON wallet_transactions (student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_parents_parent_student
  ON student_parents (parent_id, student_id);

CREATE INDEX IF NOT EXISTS idx_purchases_vendor_student
  ON purchases (vendor_id, student_id);
