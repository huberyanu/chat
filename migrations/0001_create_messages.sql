CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL CHECK (group_id IN ('1', '2', '3')),
  sender TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  image_data TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS messages_group_id_id
  ON messages (group_id, id);