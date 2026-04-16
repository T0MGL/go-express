import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { supabase } from '../../config/database.js';
import { todayPY } from '../../lib/datetime.js';

const router = Router();

/**
 * GET /stats:Dashboard KPIs
 */
router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const today = todayPY();
    const sevenDaysAgoDate = new Date();
    sevenDaysAgoDate.setDate(sevenDaysAgoDate.getDate() - 7);
    const sevenDaysAgo = sevenDaysAgoDate.toLocaleDateString('en-CA', { timeZone: 'America/Asuncion' });

    const staleDeliveryCutoff = new Date();
    staleDeliveryCutoff.setHours(staleDeliveryCutoff.getHours() - 48);

    const startOfTodayPY = new Date(`${today}T00:00:00-04:00`).toISOString();

    const [
      enviosHoyResult,
      enTransitoResult,
      entregadosResult,
      totalEnviosResult,
      porCobrarResult,
      problemasHoyResult,
      problemasAbiertosResult,
      pendientesRecoleccionHoyResult,
      enRutaSinActualizarResult,
      incidenciasActivasResult,
      recientesResult,
    ] = await Promise.all([
      // Envios created today
      supabase
        .from('envios')
        .select('id', { count: 'exact', head: true })
        .eq('eliminado', false)
        .gte('fecha', today),
      // Currently in transit
      supabase
        .from('envios')
        .select('id', { count: 'exact', head: true })
        .eq('eliminado', false)
        .eq('estado', 'en_transito'),
      // Delivered total (for tasa entrega)
      supabase
        .from('envios')
        .select('id', { count: 'exact', head: true })
        .eq('eliminado', false)
        .eq('estado', 'entregado'),
      // Total envios (for tasa entrega)
      supabase
        .from('envios')
        .select('id', { count: 'exact', head: true })
        .eq('eliminado', false)
        .in('estado', ['entregado', 'fallido']),
      // Pending payments total
      supabase
        .from('pagos')
        .select('monto_total, monto_recibido')
        .neq('estado_pago', 'pagado'),
      // Problems today
      supabase
        .from('envios')
        .select('id', { count: 'exact', head: true })
        .eq('eliminado', false)
        .eq('estado', 'problema')
        .gte('problema_fecha', startOfTodayPY),
      // Open problems (not filtered by date: anything still in estado=problema)
      supabase
        .from('envios')
        .select('id', { count: 'exact', head: true })
        .eq('eliminado', false)
        .eq('estado', 'problema'),
      // Shipments pending pickup today
      supabase
        .from('envios')
        .select('id', { count: 'exact', head: true })
        .eq('eliminado', false)
        .eq('estado', 'pendiente')
        .eq('fecha', today),
      // In-route shipments with no status update for >48h: use updated_at
      // (bumped on any estado change) to approximate staleness.
      supabase
        .from('envios')
        .select('id', { count: 'exact', head: true })
        .eq('eliminado', false)
        .in('estado', ['en_transito', 'en_reparto'])
        .lte('updated_at', staleDeliveryCutoff.toISOString()),
      // Active incidents reported by delivery partners
      supabase
        .from('envios')
        .select('id', { count: 'exact', head: true })
        .eq('eliminado', false)
        .eq('tiene_incidencia', true),
      // Recent envios (last 7 days)
      supabase
        .from('envios')
        .select('id, tracking_number, cliente_nombre, destino, estado, fecha, created_at')
        .eq('eliminado', false)
        .gte('fecha', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const totalDelivered = entregadosResult.count ?? 0;
    const totalFinalized = totalEnviosResult.count ?? 0;
    const tasaEntrega = totalFinalized > 0 ? Math.round((totalDelivered / totalFinalized) * 100) : 0;

    const porCobrar = ((porCobrarResult.data ?? []) as { monto_total: number; monto_recibido: number }[])
      .reduce((sum, p) => sum + (p.monto_total - p.monto_recibido), 0);

    const rawRecientes = (recientesResult.data ?? []) as Array<{
      id: string;
      tracking_number: string;
      cliente_nombre: string;
      destino: string;
      estado: string;
      fecha: string;
      created_at: string;
    }>;

    res.json({
      enviosHoy: enviosHoyResult.count ?? 0,
      enTransito: enTransitoResult.count ?? 0,
      entregados: totalDelivered,
      tasaEntrega,
      porCobrar,
      problemasHoy: problemasHoyResult.count ?? 0,
      problemasAbiertos: problemasAbiertosResult.count ?? 0,
      pendientesRecoleccionHoy: pendientesRecoleccionHoyResult.count ?? 0,
      enRutaSinActualizar: enRutaSinActualizarResult.count ?? 0,
      incidenciasActivas: incidenciasActivasResult.count ?? 0,
      enviosRecientes: rawRecientes.map(r => ({
        id: r.id,
        trackingNumber: r.tracking_number,
        clienteNombre: r.cliente_nombre,
        destino: r.destino,
        estado: r.estado,
        fecha: r.fecha,
      })),
    });
  })
);

export default router;
