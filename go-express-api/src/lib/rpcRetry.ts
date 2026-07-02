import { logger } from '../config/logger.js';

// M3 (Step6): red de seguridad sobre las RPCs de plata. El fix de raiz es el orden de lock
// canonico E -> L en cerrar_liquidacion (sql/048); este retry cubre la ventana residual de
// deadlock (40P01) o serialization failure (40001) bajo operadores concurrentes. Es seguro
// reintentar: la victima del deadlock rollbackea la transaccion COMPLETA (las RPCs son
// atomicas), asi que no queda estado parcial que un reintento pueda duplicar.
const RETRYABLE_SQLSTATES = new Set(['40P01', '40001']);
const MAX_ATTEMPTS = 3;

interface RpcResult {
  error: { code?: string } | null;
}

function isRetryable(error: RpcResult['error']): boolean {
  return error !== null && error.code !== undefined && RETRYABLE_SQLSTATES.has(error.code);
}

export async function rpcWithRetry<T extends RpcResult>(
  op: string,
  call: () => PromiseLike<T>,
): Promise<T> {
  let result = await call();
  for (let attempt = 1; attempt < MAX_ATTEMPTS && isRetryable(result.error); attempt++) {
    logger.warn(
      { event: 'rpc.retry', op, attempt, code: result.error?.code },
      'Deadlock o serialization failure en RPC de plata, reintentando',
    );
    // Backoff corto con jitter: suficiente para que la otra transaccion suelte los locks.
    await new Promise((resolve) => setTimeout(resolve, 100 * attempt + Math.floor(Math.random() * 50)));
    result = await call();
  }
  return result;
}
