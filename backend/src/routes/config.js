'use strict';

const express = require('express');
const crypto  = require('crypto');
const db      = require('../db/db');

const router = express.Router();

// ---------------------------------------------------------------------------
// Encryption helpers
// ---------------------------------------------------------------------------

function encrypt(text) {
  const salt = crypto.randomBytes(16);
  const iv   = crypto.randomBytes(12);
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) throw new Error('ENCRYPTION_SECRET environment variable is not set');
  const key  = crypto.scryptSync(secret, salt, 32);
  const cipher    = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag       = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
}

function decrypt(encryptedBase64) {
  const buf       = Buffer.from(encryptedBase64, 'base64');
  const salt      = buf.slice(0, 16);
  const iv        = buf.slice(16, 28);
  const tag       = buf.slice(28, 44);
  const encrypted = buf.slice(44);
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) throw new Error('ENCRYPTION_SECRET environment variable is not set');
  const key       = crypto.scryptSync(secret, salt, 32);
  const decipher  = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

// ---------------------------------------------------------------------------
// GET /api/config/kraken-keys — check if keys are configured
// ---------------------------------------------------------------------------

router.get('/kraken-keys', (req, res, next) => {
  try {
    const k1 = db.prepare("SELECT 1 FROM config WHERE key = 'kraken_api_key'").get();
    const k2 = db.prepare("SELECT 1 FROM config WHERE key = 'kraken_private_key'").get();
    res.json({ configured: !!(k1 && k2) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/config/kraken-keys — save (encrypted) keys
// ---------------------------------------------------------------------------

router.post('/kraken-keys', (req, res, next) => {
  try {
    const { apiKey, privateKey } = req.body || {};

    if (!apiKey || !privateKey) {
      return res.status(400).json({ error: 'Both apiKey and privateKey are required' });
    }

    const upsert = db.prepare(
      "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)"
    );

    const insert = db.transaction(() => {
      upsert.run('kraken_api_key',      encrypt(apiKey));
      upsert.run('kraken_private_key',  encrypt(privateKey));
    });

    insert();

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/config/kraken-keys — remove keys
// ---------------------------------------------------------------------------

router.delete('/kraken-keys', (req, res, next) => {
  try {
    const del = db.prepare("DELETE FROM config WHERE key = ?");

    db.transaction(() => {
      del.run('kraken_api_key');
      del.run('kraken_private_key');
    })();

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.decrypt = decrypt;
