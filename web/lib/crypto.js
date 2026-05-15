// AES-256-GCM at-rest encryption for Kraken API keys. Extracted from
// backend/src/routes/config.js so it can be reused by route handlers
// without coupling encrypt/decrypt to HTTP routes.

import crypto from 'node:crypto'

function getSecret() {
  const secret = process.env.ENCRYPTION_SECRET
  if (!secret) throw new Error('ENCRYPTION_SECRET environment variable is not set')
  if (secret.length < 32) {
    throw new Error('ENCRYPTION_SECRET must be at least 32 characters')
  }
  return secret
}

export function encrypt(text) {
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const key = crypto.scryptSync(getSecret(), salt, 32)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([salt, iv, tag, encrypted]).toString('base64')
}

export function decrypt(encryptedBase64) {
  const buf = Buffer.from(encryptedBase64, 'base64')
  const salt = buf.slice(0, 16)
  const iv = buf.slice(16, 28)
  const tag = buf.slice(28, 44)
  const encrypted = buf.slice(44)
  const key = crypto.scryptSync(getSecret(), salt, 32)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
