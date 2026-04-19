import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { adminWriteLimiter } from '../../middleware/rateLimit.js';
import { cuentaCorrienteService } from '../../services/cuentaCorriente.service.js';
import { sseService } from '../../services/sse.service.js';
import {
  crearAjusteSchema,
  crearNotaCreditoSchema,
  movimientoQuerySchema,
  updateLimiteCreditoSchema,
} from '../../lib/validators/cuentaCorriente.schema.js';
import { uuidSchema } from '../../lib/validators/common.schema.js';
import type { MovimientoQuery } from '../../lib/validators/cuentaCorriente.schema.js';
import type { MovimientoCc } from '../../types/index.js';

const router = Router({ mergeParams: true });

const clienteIdParamSchema = z.object({ id: uuidSchema });

router.get(
  '/:id/saldo',
  validate({ params: clienteIdParamSchema }),
  asyncHandler(async (req, res) => {
    const saldo = await cuentaCorrienteService.getSaldo(req.params['id'] as string);
    res.json(saldo);
  })
);

router.get(
  '/:id/movimientos',
  validate({ params: clienteIdParamSchema, query: movimientoQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await cuentaCorrienteService.listMovimientos(
      req.params['id'] as string,
      req.query as unknown as MovimientoQuery
    );
    res.json(result);
  })
);

router.get(
  '/:id/movimientos/export.csv',
  validate({ params: clienteIdParamSchema, query: movimientoQuerySchema }),
  asyncHandler(async (req, res) => {
    const movs = await cuentaCorrienteService.exportMovimientos(
      req.params['id'] as string,
      req.query as unknown as MovimientoQuery
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cuenta-corriente-${req.params['id']}.csv"`);
    res.send(serializeMovimientosCsv(movs));
  })
);

router.post(
  '/:id/ajuste',
  adminWriteLimiter,
  validate({ params: clienteIdParamSchema, body: crearAjusteSchema }),
  asyncHandler(async (req, res) => {
    const clienteId = req.params['id'] as string;
    const movimiento = await cuentaCorrienteService.crearAjuste(
      clienteId,
      req.body,
      req.userId!,
      req.userName ?? 'Admin GoExpress',
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined
    );
    sseService.broadcast({ entity: ['cuenta_corriente'], action: 'ajuste_created', id: clienteId });
    sseService.broadcastToCliente(
      { entity: ['cuenta_corriente'], action: 'ajuste_created', id: clienteId },
      clienteId
    );
    res.status(201).json(movimiento);
  })
);

router.post(
  '/:id/nota-credito',
  adminWriteLimiter,
  validate({ params: clienteIdParamSchema, body: crearNotaCreditoSchema }),
  asyncHandler(async (req, res) => {
    const clienteId = req.params['id'] as string;
    const movimiento = await cuentaCorrienteService.crearNotaCredito(
      clienteId,
      req.body,
      req.userId!,
      req.userName ?? 'Admin GoExpress',
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined
    );
    sseService.broadcast({ entity: ['cuenta_corriente'], action: 'nota_credito_created', id: clienteId });
    sseService.broadcastToCliente(
      { entity: ['cuenta_corriente'], action: 'nota_credito_created', id: clienteId },
      clienteId
    );
    res.status(201).json(movimiento);
  })
);

router.put(
  '/:id/limite-credito',
  adminWriteLimiter,
  validate({ params: clienteIdParamSchema, body: updateLimiteCreditoSchema }),
  asyncHandler(async (req, res) => {
    const clienteId = req.params['id'] as string;
    const result = await cuentaCorrienteService.updateLimiteCredito(
      clienteId,
      req.body.limiteCredito,
      req.body.motivo,
      req.userId!,
      req.userName ?? 'Admin GoExpress',
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined
    );
    sseService.broadcast({ entity: ['clientes', 'detail'], action: 'updated', id: clienteId });
    sseService.broadcastToCliente(
      { entity: ['cuenta_corriente'], action: 'limite_updated', id: clienteId },
      clienteId
    );
    res.json(result);
  })
);

function serializeMovimientosCsv(movs: MovimientoCc[]): string {
  const header = ['fecha', 'tipo', 'monto_gs', 'saldo_posterior_gs', 'descripcion', 'envio_id', 'pago_id'].join(',');
  const lines = movs.map((m) =>
    [
      m.creadoEn,
      m.tipo,
      m.monto.toString(),
      m.saldoPosterior.toString(),
      csvEscape(m.descripcion),
      m.envioId ?? '',
      m.pagoId ?? '',
    ].join(',')
  );
  return [header, ...lines].join('\n');
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default router;
