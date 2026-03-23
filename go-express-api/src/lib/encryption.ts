import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128-bit IV for GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt plaintext with AES-256-GCM
 * Returns format: iv:authTag:ciphertext (all base64)
 */
export function encrypt(text: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt AES-256-GCM encrypted data
 * Input format: iv:authTag:ciphertext (all base64)
 */
export function decrypt(encryptedData: string, key: Buffer): string {
  const parts = encryptedData.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted data format');
  const ivB64 = parts[0]!;
  const authTagB64 = parts[1]!;
  const ciphertextB64 = parts[2]!;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}

/**
 * Decrypt with key rotation support.
 * Tries primary key first, falls back to rotation key.
 */
export function decryptWithRotation(encryptedData: string, primaryKey: Buffer, rotationKey?: Buffer): string {
  try {
    return decrypt(encryptedData, primaryKey);
  } catch (err) {
    if (rotationKey) {
      return decrypt(encryptedData, rotationKey);
    }
    throw err;
  }
}

/**
 * SHA-256 hash for exact-match search fields (RUC, email, phone)
 * Always lowercase + trim before hashing for consistency
 */
export function hashForSearch(text: string): string {
  return crypto.createHash('sha256').update(text.toLowerCase().trim()).digest('hex');
}

/**
 * Normalize text for fuzzy search (LIKE queries).
 * Strips accents, lowercases, trims.
 * The result is stored in _search columns (NOT encrypted, but not full PII).
 */
export function normalizeForSearch(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/**
 * Parse a hex-encoded encryption key into a Buffer.
 * Validates it's exactly 256 bits (32 bytes).
 */
export function parseEncryptionKey(hexKey: string): Buffer {
  const key = Buffer.from(hexKey, 'hex');
  if (key.length !== 32) {
    throw new Error(`Encryption key must be 256 bits (32 bytes), got ${key.length * 8} bits`);
  }
  return key;
}
