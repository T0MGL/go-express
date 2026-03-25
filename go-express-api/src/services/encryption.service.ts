import { encrypt, decrypt, decryptWithRotation, hashForSearch, normalizeForSearch, parseEncryptionKey } from '../lib/encryption.js';
import { env } from '../config/env.js';


class EncryptionService {
  private readonly primaryKey: Buffer;
  private readonly rotationKey: Buffer | undefined;

  constructor() {
    this.primaryKey = parseEncryptionKey(env.ENCRYPTION_KEY);
    this.rotationKey = env.ENCRYPTION_KEY_ROTATION
      ? parseEncryptionKey(env.ENCRYPTION_KEY_ROTATION)
      : undefined;
  }

  /** Encrypt plaintext with AES-256-GCM using the primary key. */
  encrypt(text: string): string {
    return encrypt(text, this.primaryKey);
  }

  /** Decrypt ciphertext, trying primary key first then rotation key. */
  decrypt(text: string): string {
    return decryptWithRotation(text, this.primaryKey, this.rotationKey);
  }

  /** SHA-256 hash for exact-match search (RUC, email, phone). */
  hashForSearch(text: string): string {
    return hashForSearch(text);
  }

  /** Normalize text for fuzzy search (LIKE queries). Strips accents, lowercases, trims. */
  normalizeForSearch(text: string): string {
    return normalizeForSearch(text);
  }
}

export const encryptionService = new EncryptionService();
