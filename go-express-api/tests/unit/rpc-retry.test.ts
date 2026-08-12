import { describe, expect, it, vi } from 'vitest';
import { rpcWithRetry } from '../../src/lib/rpcRetry.js';

// M3 (Step6): el retry acotado sobre 40P01/40001 es la red de seguridad del reorden de locks
// de sql/048. Reintenta SOLO deadlock/serialization (la victima rollbackea la tx completa,
// reintentar es seguro), con tope duro de intentos.

describe('rpcWithRetry', () => {
  it('reintenta en 40P01 (deadlock) y devuelve el exito del reintento', async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: '40P01', message: 'deadlock detected' } })
      .mockResolvedValueOnce({ data: { id: 'ok' }, error: null });

    const result = await rpcWithRetry('create_pago_atomico', call);

    expect(call).toHaveBeenCalledTimes(2);
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: 'ok' });
  });

  it('reintenta en 40001 (serialization failure)', async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: '40001', message: 'snapshot stale' } })
      .mockResolvedValueOnce({ data: { id: 'ok' }, error: null });

    const result = await rpcWithRetry('cerrar_liquidacion', call);

    expect(call).toHaveBeenCalledTimes(2);
    expect(result.error).toBeNull();
  });

  it('respeta el limite de intentos: 3 llamadas y devuelve el ultimo error', async () => {
    const call = vi.fn().mockResolvedValue({ data: null, error: { code: '40P01', message: 'deadlock detected' } });

    const result = await rpcWithRetry('anular_pago_atomico', call);

    expect(call).toHaveBeenCalledTimes(3);
    expect(result.error).toEqual({ code: '40P01', message: 'deadlock detected' });
  });

  it('NO reintenta errores de negocio (P0001) ni exitos', async () => {
    const negocio = vi.fn().mockResolvedValue({ data: null, error: { code: 'P0001', message: 'liquidacion_ya_cerrada' } });
    const exito = vi.fn().mockResolvedValue({ data: { id: 'ok' }, error: null });

    const r1 = await rpcWithRetry('cerrar_liquidacion', negocio);
    const r2 = await rpcWithRetry('cerrar_liquidacion', exito);

    expect(negocio).toHaveBeenCalledTimes(1);
    expect(exito).toHaveBeenCalledTimes(1);
    expect(r1.error).toEqual({ code: 'P0001', message: 'liquidacion_ya_cerrada' });
    expect(r2.error).toBeNull();
  });
});
