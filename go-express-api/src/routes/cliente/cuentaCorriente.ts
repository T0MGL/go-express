import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { cuentaCorrienteService } from '../../services/cuentaCorriente.service.js';
import { movimientoQuerySchema } from '../../lib/validators/cuentaCorriente.schema.js';
import type { MovimientoQuery } from '../../lib/validators/cuentaCorriente.schema.js';

const router = Router();

router.get(
  '/saldo',
  asyncHandler(async (req, res) => {
    const saldo = await cuentaCorrienteService.getSaldo(req.clienteId!);
    res.json(saldo);
  })
);

router.get(
  '/movimientos',
  validate({ query: movimientoQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await cuentaCorrienteService.listMovimientos(
      req.clienteId!,
      req.query as unknown as MovimientoQuery
    );
    res.json(result);
  })
);

export default router;
