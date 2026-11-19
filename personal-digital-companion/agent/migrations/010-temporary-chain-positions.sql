-- 模板的五节点上限由创建接口校验。临时登记链沿用节点表，允许更长的位置序列。
-- 迁移按一个事务应用。暂存所有任务轮次的节点外键，避免重建时影响历史任务。
CREATE TABLE chain_node_links_migration (
  task_id TEXT PRIMARY KEY NOT NULL,
  node_id TEXT NOT NULL
);
INSERT INTO chain_node_links_migration(task_id,node_id)
SELECT task_id,chain_node_id FROM tasks WHERE chain_node_id IS NOT NULL;

CREATE TABLE chain_nodes_new (
  node_id TEXT PRIMARY KEY NOT NULL,
  chain_id TEXT NOT NULL REFERENCES chains(chain_id),
  node_key TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(typeof(position) = 'integer' AND position >= 0),
  depends_on TEXT REFERENCES chain_nodes_new(node_id),
  current_task_id TEXT NOT NULL UNIQUE REFERENCES tasks(task_id),
  skipped_task_id TEXT REFERENCES tasks(task_id),
  UNIQUE(chain_id,node_key), UNIQUE(chain_id,position)
);
INSERT INTO chain_nodes_new(node_id,chain_id,node_key,position,depends_on,current_task_id,skipped_task_id)
SELECT node_id,chain_id,node_key,position,depends_on,current_task_id,skipped_task_id FROM chain_nodes;

UPDATE tasks SET chain_node_id=NULL WHERE chain_node_id IS NOT NULL;
DROP TABLE chain_nodes;
ALTER TABLE chain_nodes_new RENAME TO chain_nodes;
UPDATE tasks
SET chain_node_id=(SELECT node_id FROM chain_node_links_migration WHERE task_id=tasks.task_id)
WHERE task_id IN (SELECT task_id FROM chain_node_links_migration);
DROP TABLE chain_node_links_migration;
