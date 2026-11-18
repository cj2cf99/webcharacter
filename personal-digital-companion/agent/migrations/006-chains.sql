CREATE TABLE chains (
  chain_id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  stopped_at TEXT
);
CREATE TABLE chain_nodes (
  node_id TEXT PRIMARY KEY NOT NULL,
  chain_id TEXT NOT NULL REFERENCES chains(chain_id),
  node_key TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 4),
  depends_on TEXT REFERENCES chain_nodes(node_id),
  current_task_id TEXT NOT NULL UNIQUE REFERENCES tasks(task_id),
  skipped_task_id TEXT REFERENCES tasks(task_id),
  UNIQUE(chain_id,node_key), UNIQUE(chain_id,position)
);
ALTER TABLE tasks ADD COLUMN chain_node_id TEXT REFERENCES chain_nodes(node_id);
ALTER TABLE tasks ADD COLUMN superseded_by_task_id TEXT REFERENCES tasks(task_id);
ALTER TABLE tasks ADD COLUMN claim_request_id TEXT;
CREATE TABLE task_operations (
  request_id TEXT PRIMARY KEY NOT NULL,
  chain_id TEXT REFERENCES chains(chain_id),
  action TEXT NOT NULL CHECK(action IN ('claim','force','continue','skip','stop','redo','abandon')),
  old_task_id TEXT REFERENCES tasks(task_id),
  new_task_id TEXT REFERENCES tasks(task_id),
  from_device_id TEXT REFERENCES devices(device_id),
  to_device_id TEXT REFERENCES devices(device_id),
  created_at TEXT NOT NULL,
  request_json TEXT NOT NULL CHECK(json_valid(request_json))
);
CREATE TABLE archived_task_results (
  task_id TEXT PRIMARY KEY NOT NULL REFERENCES tasks(task_id),
  report_json TEXT NOT NULL CHECK(json_valid(report_json)),
  received_at TEXT NOT NULL
);
