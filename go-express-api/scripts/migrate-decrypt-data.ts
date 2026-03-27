/**
 * One-time migration: decrypt all AES-256-GCM ciphertext in the database.
 *
 * Run BEFORE sql/008_remove_encryption.sql (which renames _enc columns).
 *
 * Usage:
 *   npx tsx scripts/migrate-decrypt-data.ts
 *   npx tsx scripts/migrate-decrypt-data.ts --dry-run
 *
 * The script:
 *   1. Reads ENCRYPTION_KEY (and optional ENCRYPTION_KEY_ROTATION) from .env
 *   2. Connects directly to Postgres via DATABASE_URL
 *   3. For each table/column, selects rows where the value matches encrypted format
 *   4. Decrypts in-place, writing plaintext back
 *   5. Skips rows that are already plaintext (idempotent)
 *   6. Logs progress per table
 */

import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env") });

const DATABASE_URL = process.env["DATABASE_URL"];
const ENCRYPTION_KEY_HEX = process.env["ENCRYPTION_KEY"];
const ROTATION_KEY_HEX = process.env["ENCRYPTION_KEY_ROTATION"] || undefined;
const DRY_RUN = process.argv.includes("--dry-run");

if (!DATABASE_URL) {
  console.error("[FATAL] DATABASE_URL not set in .env");
  process.exit(1);
}
if (!ENCRYPTION_KEY_HEX) {
  console.error("[FATAL] ENCRYPTION_KEY not set in .env");
  process.exit(1);
}

function parseKey(hex: string): Buffer {
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error(`Key must be 256 bits (32 bytes), got ${buf.length * 8} bits`);
  }
  return buf;
}

const PRIMARY_KEY = parseKey(ENCRYPTION_KEY_HEX);
const ROTATION_KEY = ROTATION_KEY_HEX ? parseKey(ROTATION_KEY_HEX) : undefined;

// ---------------------------------------------------------------------------
// Crypto helpers (mirrors the deleted src/lib/encryption.ts exactly)
// ---------------------------------------------------------------------------

const ALGORITHM = "aes-256-gcm";
const AUTH_TAG_LENGTH = 16;

function isEncryptedFormat(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  const parts = value.split(":");
  if (parts.length !== 3) return false;
  // Each part must be non-empty and valid base64
  return parts.every((p) => {
    if (!p || p.length === 0) return false;
    try {
      const buf = Buffer.from(p, "base64");
      return buf.length > 0 && buf.toString("base64") === p;
    } catch {
      return false;
    }
  });
}

function decrypt(ciphertext: string, key: Buffer): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted format");
  const iv = Buffer.from(parts[0]!, "base64");
  const authTag = Buffer.from(parts[1]!, "base64");
  const encrypted = Buffer.from(parts[2]!, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}

function decryptWithRotation(value: string): string {
  if (!isEncryptedFormat(value)) return value;
  try {
    return decrypt(value, PRIMARY_KEY);
  } catch (primaryErr) {
    if (ROTATION_KEY) {
      try {
        return decrypt(value, ROTATION_KEY);
      } catch {
        throw primaryErr;
      }
    }
    throw primaryErr;
  }
}

// ---------------------------------------------------------------------------
// Table/column map (must match the _enc columns from 001_schema.sql)
// ---------------------------------------------------------------------------

interface ColumnSpec {
  table: string;
  columns: string[];
}

const ENCRYPTED_COLUMNS: ColumnSpec[] = [
  {
    table: "clientes",
    columns: [
      "ruc_enc",
      "contacto_nombre_enc",
      "telefono_enc",
      "email_enc",
      "direccion_enc",
    ],
  },
  {
    table: "envios",
    columns: [
      "destinatario_nombre_enc",
      "destinatario_direccion_enc",
      "destinatario_telefono_enc",
      "destinatario_telefono2_enc",
      "destinatario_cedula_enc",
      "destinatario_referencia_enc",
    ],
  },
  {
    table: "repartidores",
    columns: ["telefono_enc"],
  },
  {
    table: "pagos",
    columns: ["referencia_enc"],
  },
];

// ---------------------------------------------------------------------------
// Migration logic
// ---------------------------------------------------------------------------

async function migrateTable(
  client: pg.PoolClient,
  spec: ColumnSpec,
): Promise<{ processed: number; decrypted: number; skipped: number; errors: number }> {
  const { table, columns } = spec;

  // First check if the _enc columns still exist (migration 008 may have already renamed them)
  const colCheck = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = ANY($2)`,
    [table, columns],
  );

  const existingColumns = colCheck.rows.map((r) => r.column_name);
  if (existingColumns.length === 0) {
    console.log(`  [${table}] No _enc columns found (migration 008 already applied or table empty). Skipping.`);
    return { processed: 0, decrypted: 0, skipped: 0, errors: 0 };
  }

  const missingColumns = columns.filter((c) => !existingColumns.includes(c));
  if (missingColumns.length > 0) {
    console.log(`  [${table}] Columns already renamed (missing: ${missingColumns.join(", ")}). Working with remaining.`);
  }

  const selectCols = ["id", ...existingColumns].join(", ");
  const result = await client.query(`SELECT ${selectCols} FROM ${table}`);
  const rows = result.rows as Record<string, unknown>[];

  let decrypted = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const updates: { col: string; plaintext: string }[] = [];
    let rowHasError = false;

    for (const col of existingColumns) {
      const value = row[col];
      if (value === null || value === undefined || typeof value !== "string") {
        continue;
      }

      if (!isEncryptedFormat(value)) {
        // Already plaintext, skip
        continue;
      }

      try {
        const plaintext = decryptWithRotation(value);
        updates.push({ col, plaintext });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [${table}] ERROR decrypting row ${row["id"] as string}, column ${col}: ${msg}`);
        rowHasError = true;
        errors++;
      }
    }

    if (updates.length === 0) {
      skipped++;
      continue;
    }

    if (rowHasError) {
      // Do not partially update a row if any column failed
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [${table}] DRY RUN: would decrypt ${updates.length} column(s) in row ${row["id"] as string}`);
      decrypted++;
      continue;
    }

    const setClauses = updates.map((u, i) => `${u.col} = $${i + 2}`);
    const values = updates.map((u) => u.plaintext);
    await client.query(
      `UPDATE ${table} SET ${setClauses.join(", ")} WHERE id = $1`,
      [row["id"], ...values],
    );
    decrypted++;
  }

  return { processed: rows.length, decrypted, skipped, errors };
}

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("GO EXPRESS: Decrypt Migration");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  console.log(`Database: ${DATABASE_URL!.replace(/:[^:@]+@/, ":****@")}`);
  console.log(`Primary key: ${ENCRYPTION_KEY_HEX!.substring(0, 8)}...`);
  console.log(`Rotation key: ${ROTATION_KEY ? "configured" : "none"}`);
  console.log("=".repeat(60));
  console.log();

  const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    // Wrap everything in a transaction so a failure rolls back all changes
    await client.query("BEGIN");

    let totalDecrypted = 0;
    let totalErrors = 0;

    for (const spec of ENCRYPTED_COLUMNS) {
      console.log(`Processing: ${spec.table} (${spec.columns.length} encrypted column(s))`);
      const stats = await migrateTable(client, spec);
      console.log(
        `  Rows: ${stats.processed} total, ${stats.decrypted} decrypted, ${stats.skipped} already plaintext, ${stats.errors} errors`,
      );
      console.log();
      totalDecrypted += stats.decrypted;
      totalErrors += stats.errors;
    }

    if (totalErrors > 0) {
      console.error(`[ABORT] ${totalErrors} error(s) encountered. Rolling back all changes.`);
      await client.query("ROLLBACK");
      process.exit(1);
    }

    if (DRY_RUN) {
      console.log("[DRY RUN] No changes written. Re-run without --dry-run to apply.");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log(`[DONE] ${totalDecrypted} row(s) decrypted successfully. Safe to run 008_remove_encryption.sql.`);
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[FATAL] Unexpected error, all changes rolled back:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
