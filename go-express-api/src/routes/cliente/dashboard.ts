import { Router } from 'express';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { supabase } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import type { EnvioRow } from '../../types/index.js';

const router = Router();

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;

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

    // Fetch recent envios (last 5) with non-PII fields only.
    // Uses destinatario_nombre_search (plaintext, normalized) instead of decrypting.
    const { data: recientesData, error: recientesError } = await supabase
      .from('envios')
      .select('id, tracking_number, cliente_id, cliente_nombre, codigo_referencia, origen, destino, destinatario_nombre_search, destinatario_ciudad, destinatario_departamento, estado, costo, monto_a_cobrar, tipo_pago, fecha, created_at')
      .eq('cliente_id', clienteId)
      .eq('eliminado', false)
      .order('created_at', { ascending: false })
      .limit(5);

    if (recientesError) {
      logger.error({ error: recientesError, clienteId }, 'Error fetching recent envios');
      throw new AppError(`Error fetching recent envios: ${recientesError.message}`, 500, 'DB_ERROR');
    }

    const enviosRecientes = ((recientesData ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      trackingNumber: row['tracking_number'] as string,
      clienteId: row['cliente_id'] as string,
      clienteNombre: row['cliente_nombre'] as string,
      codigoReferencia: (row['codigo_referencia'] as string | null) ?? null,
      origen: row['origen'] as string,
      destino: row['destino'] as string,
      destinatarioNombre: (row['destinatario_nombre_search'] as string) ?? '',
      destinatarioCiudad: (row['destinatario_ciudad'] as string) ?? '',
      destinatarioDepartamento: (row['destinatario_departamento'] as string) ?? '',
      estado: row['estado'] as string,
      costo: row['costo'] as number,
      montoACobrar: row['monto_a_cobrar'] as number,
      tipoPago: row['tipo_pago'] as string,
      fecha: row['fecha'] as string,
      creadoEn: row['created_at'] as string,
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
