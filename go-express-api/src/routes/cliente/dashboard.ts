import { Router } from 'express';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { supabase } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { encryptionService } from '../../services/encryption.service.js';
import type { EnvioRow } from '../../types/index.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/cliente/dashboard/stats — Client dashboard statistics
// ---------------------------------------------------------------------------

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;

    // Fetch counts by estado for this client
    const { data: enviosData, error: enviosError } = await supabase
      .from('envios')
      .select('id, estado')
      .eq('cliente_id', clienteId)
      .eq('eliminado', false);

    if (enviosError) {
      logger.error({ error: enviosError, clienteId }, 'Error fetching dashboard stats');
      throw new AppError(`Error fetching dashboard stats: ${enviosError.message}`, 500, 'DB_ERROR');
    }

    const envios = (enviosData ?? []) as Array<Pick<EnvioRow, 'id' | 'estado'>>;

    const activos = envios.filter((e) =>
      ['pendiente', 'recolectado', 'en_transito', 'en_reparto'].includes(e.estado)
    ).length;
    const entregados = envios.filter((e) => e.estado === 'entregado').length;
    const pendientes = envios.filter((e) => e.estado === 'pendiente').length;
    const problemas = envios.filter((e) => e.estado === 'problema' || e.estado === 'fallido').length;
    const totalEnvios = envios.length;

    // Fetch recent envios (last 5) with basic info
    const { data: recientesData, error: recientesError } = await supabase
      .from('envios')
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('eliminado', false)
      .order('created_at', { ascending: false })
      .limit(5);

    if (recientesError) {
      logger.error({ error: recientesError, clienteId }, 'Error fetching recent envios');
      throw new AppError(`Error fetching recent envios: ${recientesError.message}`, 500, 'DB_ERROR');
    }

    const enviosRecientes = ((recientesData ?? []) as EnvioRow[]).map((row) => ({
      id: row.id,
      trackingNumber: row.tracking_number,
      clienteId: row.cliente_id,
      clienteNombre: row.cliente_nombre,
      codigoReferencia: row.codigo_referencia,
      origen: row.origen,
      destino: row.destino,
      destinatarioNombre: encryptionService.decrypt(row.destinatario_nombre_enc),
      destinatarioCiudad: row.destinatario_ciudad,
      destinatarioDepartamento: row.destinatario_departamento,
      estado: row.estado,
      costo: row.costo,
      montoACobrar: row.monto_a_cobrar,
      tipoPago: row.tipo_pago,
      fecha: row.fecha,
      creadoEn: row.created_at,
    }));

    res.json({
      activos,
      entregados,
      pendientes,
      problemas,
      totalEnvios,
      enviosRecientes,
    });
  })
);

export default router;
