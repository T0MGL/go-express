import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../src/middleware/errorHandler.js';
import { generateApiKey } from '../../src/lib/apiKey.js';

// El middleware consulta api_keys via el cliente global; se mockea el modulo entero para
// ejercitar cada rama de rechazo sin DB. La cadena real es
// from().select().eq().maybeSingle() para el lookup y from().update().eq() para el touch.
vi.mock('../../src/config/database.js', () => ({
  supabase: { from: vi.fn() },
  supabaseAuth: { auth: {} },
}));

const { supabase } = await import('../../src/config/database.js');
const { requireApiKey, requirePermiso } = await import('../../src/middleware/apiKeyAuth.js');

const fromMock = supabase.from as unknown as ReturnType<typeof vi.fn>;

interface KeyFixture {
  id: string;
  cliente_id: string;
  nombre: string;
  key_prefix: string;
  permisos: string[];
  activo: boolean;
  expira_en: string | null;
  clientes: { estado: string; eliminado: boolean };
}

function keyFixture(overrides: Partial<KeyFixture> = {}): KeyFixture {
  return {
    id: 'a0000000-0000-4000-a000-000000000001',
    cliente_id: 'b0000000-0000-4000-a000-000000000002',
    nombre: 'ERP Test',
    key_prefix: 'ge_live_abcd',
    permisos: ['crear_envios', 'consultar_envios'],
    activo: true,
    expira_en: null,
    clientes: { estado: 'activo', eliminado: false },
    ...overrides,
  };
}

function mockLookup(row: KeyFixture | null): { touch: ReturnType<typeof vi.fn> } {
  const touch = vi.fn().mockReturnValue(Promise.resolve({ error: null }));
  fromMock.mockImplementation((table: string) => {
    if (table !== 'api_keys') throw new Error(`Tabla inesperada: ${table}`);
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({ eq: touch }),
    };
  });
  return { touch };
}

function makeReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

async function run(req: Request): Promise<unknown> {
  let captured: unknown = 'next_no_llamado';
  const next: NextFunction = (err?: unknown) => {
    captured = err;
  };
  await requireApiKey(req, {} as Response, next);
  return captured;
}

beforeEach(() => {
  fromMock.mockReset();
});

describe('requireApiKey', () => {
  it('401 sin header X-API-Key, sin tocar la DB', async () => {
    const err = await run(makeReq());
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('401 con formato invalido, sin tocar la DB', async () => {
    const err = await run(makeReq({ 'x-api-key': 'ge_live_corta' }));
    expect((err as AppError).statusCode).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('401 con key bien formada pero inexistente', async () => {
    mockLookup(null);
    const err = await run(makeReq({ 'x-api-key': generateApiKey() }));
    expect((err as AppError).statusCode).toBe(401);
    expect((err as AppError).message).toBe('API key invalida');
  });

  it('401 con key revocada, mismo mensaje que inexistente (no filtra existencia)', async () => {
    mockLookup(keyFixture({ activo: false }));
    const err = await run(makeReq({ 'x-api-key': generateApiKey() }));
    expect((err as AppError).statusCode).toBe(401);
    expect((err as AppError).message).toBe('API key invalida');
  });

  it('401 con key expirada', async () => {
    mockLookup(keyFixture({ expira_en: new Date(Date.now() - 60_000).toISOString() }));
    const err = await run(makeReq({ 'x-api-key': generateApiKey() }));
    expect((err as AppError).statusCode).toBe(401);
    expect((err as AppError).message).toBe('API key invalida');
  });

  it('403 con cliente suspendido', async () => {
    mockLookup(keyFixture({ clientes: { estado: 'suspendido', eliminado: false } }));
    const err = await run(makeReq({ 'x-api-key': generateApiKey() }));
    expect((err as AppError).statusCode).toBe(403);
  });

  it('con key valida adjunta identidad al request y anota last_used_at', async () => {
    const fixture = keyFixture({ expira_en: new Date(Date.now() + 60_000).toISOString() });
    const { touch } = mockLookup(fixture);
    const req = makeReq({ 'x-api-key': generateApiKey() });

    const err = await run(req);

    expect(err).toBeUndefined();
    expect(req.apiKeyId).toBe(fixture.id);
    expect(req.clienteId).toBe(fixture.cliente_id);
    expect(req.apiKeyPermisos).toEqual(fixture.permisos);
    expect(req.apiKeyPrefix).toBe(fixture.key_prefix);
    expect(touch).toHaveBeenCalledWith('id', fixture.id);
  });
});

describe('requirePermiso', () => {
  function runGuard(permisos: string[] | undefined, permiso: 'crear_envios' | 'consultar_tarifas'): unknown {
    let captured: unknown = 'next_no_llamado';
    const req = { apiKeyPermisos: permisos, path: '/x', method: 'GET' } as unknown as Request;
    requirePermiso(permiso)(req, {} as Response, (err?: unknown) => {
      captured = err;
    });
    return captured;
  }

  it('deja pasar cuando la key tiene el permiso', () => {
    expect(runGuard(['crear_envios'], 'crear_envios')).toBeUndefined();
  });

  it('403 cuando la key no tiene el permiso', () => {
    const err = runGuard(['consultar_envios'], 'crear_envios');
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
  });

  it('403 cuando el request no paso por requireApiKey', () => {
    const err = runGuard(undefined, 'consultar_tarifas');
    expect((err as AppError).statusCode).toBe(403);
  });
});
