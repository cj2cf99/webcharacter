import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, readdirSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

const root = resolve(import.meta.dirname, '..');
const fixtures = join(root, 'agent/fixtures/dev-databases');
const agent = join(root, 'agent');
const migrations = join(agent, 'migrations');
const main = process.env.FEIYUE_MAIN_DIR;
const [option, destination, ...extra] = process.argv.slice(2);
if (!main || extra.length || (option !== undefined && (option !== '--output' || !destination))) {
  throw Error('设置 FEIYUE_MAIN_DIR 后运行 node tools/dev-databases.mjs [--output <新开发库目录>]');
}

const databases = [
  ['desktop-tasks.sqlite', [join(agent, 'execution/schema.sql')]],
  ['companion-d1.sqlite', [
    ...readdirSync(migrations).filter(name => name.endsWith('.sql')).sort().map(name => join(migrations, name)),
    join(agent, 'seeds/tasklist-hu-shi.sql'),
    join(agent, 'seeds/tasklist-registration.sql'),
  ]],
  ['main-d1.sqlite', [join(main, 'docs/design/database/schema.sql'), join(fixtures, 'main-seed.sql')]],
];

function verify(db) {
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0, '数据库存在无效外键');
}

function digest(db) {
  const objects = db.prepare(`SELECT name,type,sql FROM sqlite_schema
    WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name`).all();
  const tables = objects.filter(object => object.type === 'table');
  const rows = tables.map(({name}) => db.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '"').all()
    .map(row => JSON.stringify(row)).sort());
  return createHash('sha256').update(JSON.stringify({objects, rows})).digest('hex');
}

const directory = destination ? resolve(destination) : fixtures;
if (destination) {
  mkdirSync(directory, {recursive: true});
  for (const [name] of databases) {
    assert.ok(!existsSync(join(directory, name)), '目标已有数据库，请选择一个新目录');
  }
}
for (const [name, inputs] of databases) {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('BEGIN');
    for (const path of inputs) db.exec(readFileSync(path, 'utf8').replaceAll('\r\n', '\n'));
    db.exec('COMMIT');
    verify(db);
    const file = join(directory, name);
    if (destination) db.prepare('VACUUM INTO ?').run(file);
    const reopened = new DatabaseSync(file, {readOnly: true});
    try {
      verify(reopened);
      assert.ok(digest(db) === digest(reopened), name + ' 与当前结构或合成种子不一致');
    } finally {
      reopened.close();
    }
    console.log('SQLite 验证通过 · ' + name);
  } finally {
    db.close();
  }
}
