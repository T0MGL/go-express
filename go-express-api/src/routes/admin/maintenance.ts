import { Router } from 'express';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { requireOnlyAdmin } from '../../middleware/adminAuth.js';
import { runPodCleanup, getLastPodCleanupResult } from '../../services/podCleanup.service.js';
import { auditoriaService } from '../../services/auditoria.service.js';

const router = Router();

router.use(requireOnlyAdmin);

router.get(
  '/pod-cleanup/last',
  asyncHandler(async (_req, res) => {
    res.json({ lastResult: getLastPodCleanupResult() });
  }),
);

router.post(
  '/pod-cleanup/run',
  asyncHandler(async (req, res) => {
    if (!req.userId) {
      throw AppError.unauthorized();
    }

    const result = await runPodCleanup({
      triggeredBy: `manual:${req.userName ?? req.userEmail ?? req.userId}`,
    });

    await auditoriaService
      .log({
        usuario: req.userName ?? 'Admin',
        usuarioId: req.userId,
        accion: 'eliminar',
        entidad: 'sistema',
        entidadId: req.userId,
        descripcion:
          `Trigger manual de retencion POD 30d. Resultado: ${result.deletedFromStorage} fotos eliminadas, ` +
          `${result.envioRowsNullified} envios actualizados, ${result.errors} errores, ${result.scanned} escaneadas.`,
        ipAddress: req.ip ?? undefined,
        userAgent: req.headers['user-agent'] ?? undefined,
      })
      .catch(() => undefined);

    res.json(result);
  }),
);

export default router;
