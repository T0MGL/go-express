import { Router } from 'express';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { trackingLimiter } from '../../middleware/rateLimit.js';
import { supabase } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import type { TarifaRow } from '../../types/index.js';

const router = Router();

interface PublicCiudad {
  nombre: string;
  estandar: number | null;
  express: number | null;
}

/**
 * GET /api/public/tarifas
 *
 * Returns active cities with their base prices for the landing page.
 * No auth required. No internal IDs exposed. Rate-limited same as tracking (30/min).
 */
router.get(
  '/',
  trackingLimiter,
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from('tarifas')
      .select('destino, tipo_servicio, precio_base')
      .eq('activo', true)
      .eq('eliminado', false)
      .order('destino');

    if (error) {
      logger.error({ error }, 'Error fetching public tarifas');
      throw new AppError(`Error fetching tarifas: ${error.message}`, 500, 'DB_ERROR');
    }

    type TarifaSlice = Pick<TarifaRow, 'destino' | 'tipo_servicio' | 'precio_base'>;
    const rows = (data ?? []) as TarifaSlice[];

    const grouped = new Map<string, { estandar: number | null; express: number | null }>();

    for (const row of rows) {
      let entry = grouped.get(row.destino);
      if (!entry) {
        entry = { estandar: null, express: null };
        grouped.set(row.destino, entry);
      }
      if (row.tipo_servicio === 'estandar') {
        entry.estandar = row.precio_base;
      } else if (row.tipo_servicio === 'express') {
        entry.express = row.precio_base;
      }
    }

    const ciudades: PublicCiudad[] = Array.from(grouped.entries()).map(
      ([nombre, precios]) => ({
        nombre,
        estandar: precios.estandar,
        express: precios.express,
      }),
    );

    // Tarifas cambian poco, 5min en CDN reduce carga del API en horario pico de cotizadores.
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    res.json({ ciudades, hub: 'Asunción' });
  }),
);

export default router;
