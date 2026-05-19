import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { supabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { auditoriaService } from './auditoria.service.js';

const POD_BUCKET = 'pod-entregas';
const RETENTION_DAYS = 30;
const SCAN_PAGE_SIZE = 1000;
const REMOVE_BATCH_SIZE = 100;

const LOCK_NAME = 'pod_cleanup' as const;
// TTL del lock: si el job tarda mas que esto, otra instancia podria arrancar otra
// corrida. 15 min cubre limpieza de decenas de miles de fotos con margen amplio.
const LOCK_TTL_SECONDS = 15 * 60;

// Identidad unica del proceso. Se genera al cargar el modulo y persiste mientras
// el proceso vive, asi release_system_lock solo libera locks tomados por este pid.
const PROCESS_OWNER = `${hostname()}:${process.pid}:${randomUUID()}`;

const SISTEMA_USER_ID = '00000000-0000-4000-a000-000000000001';

export interface PodCleanupResult {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  cutoffISO: string;
  scanned: number;
  deletedFromStorage: number;
  envioRowsNullified: number;
  errors: number;
  skipped: boolean;
  skipReason?: string;
}

interface StorageObjectRow {
  name: string;
  created_at: string;
}

let lastResult: PodCleanupResult | null = null;
let inFlight: Promise<PodCleanupResult> | null = null;

export function getLastPodCleanupResult(): PodCleanupResult | null {
  return lastResult;
}

async function tryAcquireLock(): Promise<boolean> {
  const { data, error } = await supabase.rpc('try_acquire_system_lock', {
    p_name: LOCK_NAME,
    p_owner: PROCESS_OWNER,
    p_ttl_seconds: LOCK_TTL_SECONDS,
  });
  if (error) {
    // Si la migracion 029 no esta aplicada, no podemos garantizar single-runner.
    // Fallamos cerrado: mejor saltar la corrida que correr 2 en paralelo.
    logger.error({ err: error }, 'pod-cleanup: try_acquire_system_lock RPC failed, skipping run');
    return false;
  }
  return data === true;
}

async function releaseLock(): Promise<void> {
  const { error } = await supabase.rpc('release_system_lock', {
    p_name: LOCK_NAME,
    p_owner: PROCESS_OWNER,
  });
  if (error) {
    logger.warn({ err: error }, 'pod-cleanup: failed to release system lock (will expire by TTL)');
  }
}

async function fetchOldObjects(cutoffISO: string): Promise<StorageObjectRow[]> {
  const all: StorageObjectRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .schema('storage')
      .from('objects')
      .select('name, created_at')
      .eq('bucket_id', POD_BUCKET)
      .lt('created_at', cutoffISO)
      .order('created_at', { ascending: true })
      .range(offset, offset + SCAN_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`pod-cleanup: failed to list storage.objects: ${error.message}`);
    }

    const rows = (data ?? []) as StorageObjectRow[];
    all.push(...rows);

    if (rows.length < SCAN_PAGE_SIZE) break;
    offset += SCAN_PAGE_SIZE;
  }

  return all;
}

async function removeBatch(paths: string[]): Promise<number> {
  if (paths.length === 0) return 0;
  const { data, error } = await supabase.storage.from(POD_BUCKET).remove(paths);
  if (error) {
    logger.error({ err: error, sample: paths.slice(0, 3) }, 'pod-cleanup: storage.remove batch failed');
    throw new Error(`storage.remove failed: ${error.message}`);
  }
  return data?.length ?? 0;
}

async function nullifyEnvioFotos(paths: string[]): Promise<number> {
  if (paths.length === 0) return 0;

  const envioIds = Array.from(
    new Set(
      paths
        .map((p) => p.split('/')[0])
        .filter((id): id is string => typeof id === 'string' && id.length === 36),
    ),
  );

  if (envioIds.length === 0) return 0;

  let total = 0;
  // Lote envio_ids en chunks de 200 para mantener payload .in() chico.
  const CHUNK = 200;
  for (let i = 0; i < envioIds.length; i += CHUNK) {
    const slice = envioIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('envios')
      .update({ foto_entrega_url: null })
      .in('id', slice)
      .not('foto_entrega_url', 'is', null)
      .select('id');

    if (error) {
      logger.error({ err: error, count: slice.length }, 'pod-cleanup: failed to nullify envios.foto_entrega_url');
      throw new Error(`envios update failed: ${error.message}`);
    }
    total += data?.length ?? 0;
  }

  return total;
}

export async function runPodCleanup(opts: { triggeredBy?: string } = {}): Promise<PodCleanupResult> {
  if (inFlight) return inFlight;

  const promise = (async (): Promise<PodCleanupResult> => {
    const startedAt = new Date();
    const cutoffISO = new Date(startedAt.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const acquired = await tryAcquireLock();
    if (!acquired) {
      const result: PodCleanupResult = {
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        cutoffISO,
        scanned: 0,
        deletedFromStorage: 0,
        envioRowsNullified: 0,
        errors: 0,
        skipped: true,
        skipReason: 'lock held by another instance or RPC failed',
      };
      logger.info(result, 'pod-cleanup: skipped (lock not acquired)');
      lastResult = result;
      return result;
    }

    let scanned = 0;
    let deletedFromStorage = 0;
    let envioRowsNullified = 0;
    let errors = 0;

    try {
      const oldObjects = await fetchOldObjects(cutoffISO);
      scanned = oldObjects.length;

      logger.info({ scanned, cutoffISO, triggeredBy: opts.triggeredBy ?? 'scheduler' }, 'pod-cleanup: starting purge');

      for (let i = 0; i < oldObjects.length; i += REMOVE_BATCH_SIZE) {
        const batch = oldObjects.slice(i, i + REMOVE_BATCH_SIZE);
        const paths = batch.map((o) => o.name);

        try {
          const removed = await removeBatch(paths);
          deletedFromStorage += removed;
          envioRowsNullified += await nullifyEnvioFotos(paths);
        } catch (err) {
          errors += 1;
          logger.error({ err, batchStart: i }, 'pod-cleanup: batch failed, continuing with next batch');
        }
      }
    } finally {
      await releaseLock();
    }

    const finishedAt = new Date();
    const result: PodCleanupResult = {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      cutoffISO,
      scanned,
      deletedFromStorage,
      envioRowsNullified,
      errors,
      skipped: false,
    };

    lastResult = result;

    logger.info(result, 'pod-cleanup: finished');

    if (deletedFromStorage > 0 || errors > 0) {
      await auditoriaService
        .log({
          usuario: 'Sistema GoExpress',
          usuarioId: SISTEMA_USER_ID,
          accion: 'eliminar',
          entidad: 'sistema',
          entidadId: SISTEMA_USER_ID,
          descripcion:
            `Retencion POD 30d: ${deletedFromStorage} fotos eliminadas, ` +
            `${envioRowsNullified} envios actualizados, ${errors} errores. ` +
            `Trigger: ${opts.triggeredBy ?? 'scheduler'}.`,
        })
        .catch((err) => logger.error({ err }, 'pod-cleanup: failed to write audit log (non-blocking)'));
    }

    return result;
  })();

  inFlight = promise;
  try {
    return await promise;
  } finally {
    inFlight = null;
  }
}

const TICK_INTERVAL_MS = 60 * 60 * 1000;
const RUN_HOUR_PY = 3;

let schedulerHandle: ReturnType<typeof setInterval> | null = null;
let lastRunDayKey: string | null = null;

function pyDayKey(date: Date): string {
  // America/Asuncion = UTC-4 fija (sin DST desde 2024). Documentado en lib/datetime.ts.
  const py = new Date(date.getTime() - 4 * 60 * 60 * 1000);
  return `${py.getUTCFullYear()}-${py.getUTCMonth() + 1}-${py.getUTCDate()}`;
}

function pyHour(date: Date): number {
  return new Date(date.getTime() - 4 * 60 * 60 * 1000).getUTCHours();
}

export function startPodCleanupScheduler(): void {
  if (schedulerHandle) return;

  const tick = (): void => {
    const now = new Date();
    const hour = pyHour(now);
    const day = pyDayKey(now);

    if (hour === RUN_HOUR_PY && lastRunDayKey !== day) {
      lastRunDayKey = day;
      runPodCleanup({ triggeredBy: 'scheduler' }).catch((err) =>
        logger.error({ err }, 'pod-cleanup: scheduled run threw'),
      );
    }
  };

  schedulerHandle = setInterval(tick, TICK_INTERVAL_MS);
  schedulerHandle.unref();
  // Tick inmediato: cubre el caso donde el server arranca dentro de la ventana 03:xx PY.
  // Sin esto, setInterval recien fire en 1 hora y perdemos la corrida del dia.
  tick();
  logger.info({ runHourPY: RUN_HOUR_PY, retentionDays: RETENTION_DAYS }, 'pod-cleanup: scheduler armed');
}

export function stopPodCleanupScheduler(): void {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
  }
}
