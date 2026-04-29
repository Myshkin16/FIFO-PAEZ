'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const { initSchema } = require('./schema');

// Resolve DB path relative to the backend directory (two levels up from src/db)
const DB_PATH = path.resolve(__dirname, '..', '..', 'crypto_fifo.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Create tables if they don't exist
initSchema(db);

module.exports = db;
