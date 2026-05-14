'use strict';

const fs   = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Applies all .sql migrations whose numeric prefix is greater than the DB's
 * current `PRAGMA user_version`. Each migration runs in a transaction; on
 * success the user_version is bumped to the migration's number. If any
 * migration fails the transaction rolls back and the user_version stays put.
 *
 * Naming convention: `NNN_description.sql` where NNN is a zero-padded
 * integer that monotonically increases.
 *
 * @param {import('better-sqlite3').Database} db
 */
function applyMigrations(db) {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => {
      const m = f.match(/^(\d+)_/);
      if (!m) throw new Error(`Migration filename must start with digits: ${f}`);
      return { version: parseInt(m[1], 10), name: f };
    })
    .sort((a, b) => a.version - b.version);

  const currentVersion = db.pragma('user_version', { simple: true });
  const pending = files.filter(f => f.version > currentVersion);

  if (pending.length === 0) return { applied: 0, currentVersion };

  for (const { version, name } of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
    const apply = db.transaction(() => {
      db.exec(sql);
      // PRAGMA user_version doesn't accept bound parameters, so interpolate.
      db.exec(`PRAGMA user_version = ${version}`);
    });
    try {
      apply();
      console.log(`[db] Applied migration ${name}`);
    } catch (err) {
      err.message = `Migration ${name} failed: ${err.message}`;
      throw err;
    }
  }

  return {
    applied: pending.length,
    currentVersion: pending[pending.length - 1].version,
  };
}

module.exports = { applyMigrations };
