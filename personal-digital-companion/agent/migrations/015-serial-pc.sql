ALTER TABLE chains ADD COLUMN serial_pc INTEGER NOT NULL DEFAULT 0 CHECK(serial_pc IN (0,1));
-- 每个逻辑节点仅绑定一次业务对象，保留业务端核实的回执供重放。
CREATE TABLE pc_registration_receipts (
  operation_id TEXT PRIMARY KEY NOT NULL,
  binding_json TEXT NOT NULL CHECK(json_valid(binding_json)),
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json))
);
