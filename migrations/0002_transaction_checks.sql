CREATE TABLE IF NOT EXISTS transaction_checks (
  id TEXT PRIMARY KEY,
  valid INTEGER NOT NULL CHECK(valid = 1)
);
