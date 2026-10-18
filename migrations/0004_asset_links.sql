CREATE TABLE IF NOT EXISTS asset_links (
  key TEXT PRIMARY KEY,
  document_path TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 0
);
