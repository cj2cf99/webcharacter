CREATE TABLE IF NOT EXISTS ai_route_cooldown (
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  until_ms INTEGER NOT NULL,
  PRIMARY KEY(owner_id, provider)
);
