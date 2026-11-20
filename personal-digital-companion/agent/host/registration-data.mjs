const targets = new Map([
  ['/api/records/hu-shi/food/entries', ['ra_hushi_records', 'id', 'created_at']],
  ['/api/records/hu-shi/exercise/entries', ['ra_hushi_records', 'id', 'created_at']],
  ['/api/records/hu-shi/event/entries', ['ra_hushi_records', 'id', 'created_at']],
  ['/api/resources', ['rl_resources', 'id', 'created_at']],
  ['/api/records', ['ra_records', 'id', 'created_at']],
  ['/api/diaries', ['diaries', 'seq', 'NULL']],
  ['/api/reminders', ['reminders', 'seq', 'NULL']],
]);
const validKey = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');

function receipt(row) {
  if (row.path === '/api/diaries' || row.path === '/api/reminders') return {item: {seq: Number(row.record_id)}};
  return {id: row.record_id, created_at: row.created_at};
}

export function createRegistrationDataGateway(db, handle) {
  const find = key => db.prepare('SELECT * FROM companion_registration_receipts WHERE node_id=?').bind(key).first();
  return {
    async categories() {
      return (await db.prepare('SELECT id,name FROM ra_categories ORDER BY name,id').all()).results;
    },
    async lookup(key, path) {
      if (!validKey(key) || !targets.has(path)) return null;
      const row = await find(key);
      return row?.path === path ? receipt(row) : null;
    },
    async register({path, body, idempotencyKey: key} = {}) {
      const target = targets.get(path);
      if (!target || !validKey(key) || !body || typeof body !== 'object' || Array.isArray(body)) return {rejected: 400};
      const json = JSON.stringify(body);
      if (json.length > 210000) return {rejected: 413};
      const hash = await digest(json);
      const known = row => row.path === path && row.body_hash === hash ? {receipt: receipt(row)} : {rejected: 409};
      const prior = await find(key);
      if (prior) return known(prior);
      const [table, identity, stamp] = target;
      let databaseError = false;
      async function insert(statement, mode = 'run') {
        try {
          const [written] = await db.batch([statement, db.prepare(`
            INSERT INTO companion_registration_receipts(node_id,path,body_hash,record_id,created_at)
            SELECT ?,?,?,CAST(${identity} AS TEXT),${stamp} FROM ${table}
            WHERE rowid=last_insert_rowid() AND changes()>0
          `).bind(key, path, hash)]);
          return mode === 'first' ? written.results[0] ?? null : written;
        } catch (error) {
          databaseError = true;
          throw error;
        }
      }
      let status;
      try { status = (await handle(path, json, insert)).status; }
      catch (error) { status = error?.status; }
      const saved = await find(key);
      if (saved) return known(saved);
      if (!databaseError && status >= 400 && status < 500 && status !== 408) return {rejected: status};
      return {unknown: true};
    },
  };
}
