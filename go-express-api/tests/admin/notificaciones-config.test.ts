import { request, adminHeaders } from '../setup/test-client.js';
import {
  parseNotificacionesConfig,
  validateNotificacionesConfigInput,
  NOTIFICACIONES_DEFAULTS,
  NOTIFICACIONES_KEYS,
} from '../../src/lib/notificaciones.js';
import { notificacionesConfigService } from '../../src/services/notificacionesConfig.service.js';

const allEnabled = {
  envio_creado: true,
  recolectado: true,
  en_transito: true,
  en_reparto: true,
  entregado: true,
  fallido: true,
  problema: true,
};

describe('GET /api/admin/configuracion/notificaciones', () => {
  it('returns 200 and all seven toggles', async () => {
    const res = await request
      .get('/api/admin/configuracion/notificaciones')
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('config');
    for (const key of NOTIFICACIONES_KEYS) {
      expect(typeof res.body.config[key]).toBe('boolean');
    }
  });

  it('returns 401 without auth', async () => {
    const res = await request.get('/api/admin/configuracion/notificaciones');
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/admin/configuracion/notificaciones', () => {
  it('upserts the toggles and returns the parsed config', async () => {
    const payload = { ...allEnabled, entregado: false, fallido: false };

    const res = await request
      .put('/api/admin/configuracion/notificaciones')
      .set(adminHeaders())
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.config.entregado).toBe(false);
    expect(res.body.config.fallido).toBe(false);
    expect(res.body.config.envio_creado).toBe(true);
  });

  it('persists across GET after PUT', async () => {
    const payload = { ...allEnabled, en_transito: false };

    await request
      .put('/api/admin/configuracion/notificaciones')
      .set(adminHeaders())
      .send(payload);

    const res = await request
      .get('/api/admin/configuracion/notificaciones')
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body.config.en_transito).toBe(false);
  });

  it('rejects non-boolean values with 400', async () => {
    const res = await request
      .put('/api/admin/configuracion/notificaciones')
      .set(adminHeaders())
      .send({ ...allEnabled, entregado: 'si' });

    expect(res.status).toBe(400);
  });

  it('rejects missing keys with 400', async () => {
    const partial = { envio_creado: true, recolectado: true };
    const res = await request
      .put('/api/admin/configuracion/notificaciones')
      .set(adminHeaders())
      .send(partial);

    expect(res.status).toBe(400);
  });

  it('rejects update via the generic /:key endpoint', async () => {
    const res = await request
      .put('/api/admin/configuracion/notificaciones_config')
      .set(adminHeaders())
      .send({ value: allEnabled });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/notificaciones/i);
  });

  it('invalidates the service cache so the next read sees the new value', async () => {
    await request
      .put('/api/admin/configuracion/notificaciones')
      .set(adminHeaders())
      .send({ ...allEnabled, problema: false });

    const enabledAfter = await notificacionesConfigService.isEnabled('problema');
    expect(enabledAfter).toBe(false);

    // Restore to all-enabled for any subsequent test in the suite.
    await request
      .put('/api/admin/configuracion/notificaciones')
      .set(adminHeaders())
      .send(allEnabled);

    const restored = await notificacionesConfigService.isEnabled('problema');
    expect(restored).toBe(true);
  });

  afterAll(async () => {
    // Leave DB in a known state so other suites do not inherit a half-disabled config.
    await request
      .put('/api/admin/configuracion/notificaciones')
      .set(adminHeaders())
      .send(allEnabled);
  });
});

describe('notificaciones lib helpers', () => {
  it('parse falls back to defaults when raw is malformed', () => {
    expect(parseNotificacionesConfig(null)).toEqual(NOTIFICACIONES_DEFAULTS);
    expect(parseNotificacionesConfig('bad')).toEqual(NOTIFICACIONES_DEFAULTS);
  });

  it('parse coerces string booleans from legacy data', () => {
    const cfg = parseNotificacionesConfig({ ...allEnabled, entregado: 'false' });
    expect(cfg.entregado).toBe(false);
  });

  it('validate rejects when a key is not boolean', () => {
    expect(() => validateNotificacionesConfigInput({ ...allEnabled, entregado: 1 })).toThrow();
  });
});
