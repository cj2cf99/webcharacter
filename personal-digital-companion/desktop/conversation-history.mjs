import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';

const date = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'});
export const tokyoDay = time => date.format(time);

export function createConversationHistory(profile, safeStorage) {
  let db;
  function database() {
    if (!db) {
      db = new DatabaseSync(join(profile,'conversations.sqlite'));
      db.exec('CREATE TABLE IF NOT EXISTS turns (id TEXT PRIMARY KEY, day TEXT NOT NULL, at INTEGER NOT NULL, payload BLOB NOT NULL); CREATE INDEX IF NOT EXISTS turns_day ON turns(day,at)');
    }
    return db;
  }
  async function decode({id,at,payload}) {
    const {result}=await safeStorage.decryptStringAsync(Buffer.from(payload));
    return {id,at,...JSON.parse(result)};
  }
  return {
    latest(day) {
      const row=database().prepare('SELECT id,at,payload FROM turns WHERE day=? ORDER BY at DESC,rowid DESC LIMIT 1').get(day);
      return row?decode(row):null;
    },
    async save(turn) {
      const {id,at,question,text,sources,state,retry,answeredAt,failures,imageJob,serverTaskId,transcriptId} = turn;
      const bytes = await safeStorage.encryptStringAsync(JSON.stringify({question,text,sources,state,retry,answeredAt,failures,imageJob,serverTaskId,transcriptId}));
      database().prepare('INSERT INTO turns VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(id,tokyoDay(at),at,bytes);
    },
    read(day) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw Error('日期无效');
      const rows=database().prepare('SELECT id,at,payload FROM turns WHERE day=? ORDER BY at DESC,rowid DESC').all(day);
      return Promise.all(rows.map(decode));
    },
    close(){db?.close();db=null;},
  };
}
