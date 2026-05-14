'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const { applyMigrations } = require('./migrations');

// Resolve DB path relative to the backend directory (two levels up from src/db)
const DB_PATH = path.resolve(__dirname, '..', '..', 'crypto_fifo.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Apply any pending schema migrations. The migration runner uses
// PRAGMA user_version to track which migrations have been applied, so
// this is safe to run on every boot (idempotent).
applyMigrations(db);

module.exports = db;
