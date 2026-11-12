CREATE TABLE IF NOT EXISTS pings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  install_id TEXT NOT NULL,
  event TEXT NOT NULL,
  version TEXT,
  os TEXT,
  runtime TEXT,
  system_id TEXT,
  run_id TEXT,
  release_version TEXT,
  eval_version TEXT,
  eval_passed INTEGER,
  human_decision TEXT,
  reason_code TEXT,
  duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS pings_install ON pings (install_id);
CREATE INDEX IF NOT EXISTS pings_received ON pings (received_at);
