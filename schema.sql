CREATE TABLE IF NOT EXISTS prihlasky (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT DEFAULT (datetime('now')),
  meno TEXT NOT NULL,
  kontakt TEXT NOT NULL,
  termin TEXT,
  rande TEXT,
  sprava TEXT,
  ua TEXT,
  film TEXT
);
