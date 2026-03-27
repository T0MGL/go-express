import { Router } from 'express';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { supabase } from '../../config/database.js';
import { logger } from '../../config/logger.js';

const router = Router();

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;

    const [
      activosResult,
      entregadosResult,
      pendientesResult,
      problemasResult,
      totalResult,
      recientesResult,
    ] = await Promise.all([
      supabase
        .from('envios')
        .select('id', { count: 'exact', head: true })
        .eq('cliente_id', clienteId)
        .eq('eliminado', false)
        .in('estado', ['pendiente', 'recolectado', 'en_transito', 'en_reparto']),
      supabase
        .from('envios')
        .select('id', { count: 'exact', head: true })
        .eq('cliente_id', clienteId)
        .eq('eliminado', false)
        .eq('estado', 'entregado'),
      supabase
        .from('envios')
        .select('id', { count: 'exact', head: true })
        .eq('cliente_id', clienteId)
        .eq('eliminado', false)
        .eq('estado', 'pendiente'),
      supabase
        .from('envios')
        .select('id', { count: 'exact', head: true })
        .eq('cliente_id', clienteId)
        .eq('eliminado', false)
        .in('estado', ['problema', 'fallido']),
      supabase
        .from('envios')
        .select('id', { count: 'exact', head: true })
        .eq('cliente_id', clienteId)
        .eq('eliminado', false),
      supabase
        .from('envios')
        .select('id, tracking_number, cliente_id, cliente_nombre, codigo_referencia, origen, destino, destinatario_nombre, destinatario_ciudad, destinatario_departamento, estado, costo, monto_a_cobrar, tipo_pago, fecha, created_at')
        .eq('cliente_id', clienteId)
        .eq('eliminado', false)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    if (totalResult.error) {
      logger.error({ error: totalResult.error, clienteId }, 'Error fetching dashboard stats');
      throw new AppError(`Error fetching dashboard stats: ${totalResult.error.message}`, 500, 'DB_ERROR');
    }

    const enviosRecientes = ((recientesResult.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      trackingNumber: row['tracking_number'] as string,
      clienteId: row['cliente_id'] as string,
      clienteNombre: row['cliente_nombre'] as string,
      codigoReferencia: (row['codigo_referencia'] as string | null) ?? null,
      origen: row['origen'] as string,
      destino: row['destino'] as string,
      destinatarioNombre: (row['destinatario_nombre'] as string) ?? '',
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
      activos: activosResult.count ?? 0,
      entregados: entregadosResult.count ?? 0,
      pendientes: pendientesResult.count ?? 0,
      problemas: problemasResult.count ?? 0,
      totalEnvios: totalResult.count ?? 0,
      enviosRecientes,
    });
  })
);

export default router;
