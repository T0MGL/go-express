import { Router } from 'express';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { supabase } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { emailService } from '../../services/email.service.js';
import { sseService } from '../../services/sse.service.js';
import { generateTrackingNumber } from '../../lib/trackingNumber.js';
import { bulkLimiter } from '../../middleware/rateLimit.js';
import { createEnvioSchema, envioQuerySchema, bulkImportSchema } from '../../lib/validators/envio.schema.js';
import { escapeLikePattern } from '../../lib/validators/common.schema.js';
import { idParamSchema } from '../../lib/validators/common.schema.js';
import type { EnvioRow, EventoEnvioRow, PagoRow, Envio } from '../../types/index.js';
import type { CreateEnvioInput, EnvioQuery } from '../../lib/validators/envio.schema.js';

const router = Router();

const ENVIO_COLUMNS = [
  'id', 'tracking_number', 'cliente_id', 'cliente_nombre', 'codigo_referencia',
  'origen', 'destino',
  'destinatario_nombre', 'destinatario_direccion', 'destinatario_telefono',
  'destinatario_telefono2', 'destinatario_cedula',
  'destinatario_ciudad', 'destinatario_departamento', 'destinatario_barrio',
  'destinatario_referencia', 'destinatario_ubicacion_url',
  'cantidad', 'producto', 'peso',
  'dimensiones_largo', 'dimensiones_ancho', 'dimensiones_alto',
  'fragil', 'valor_declarado', 'instrucciones_entrega', 'horario_entrega', 'notas',
  'estado', 'costo', 'monto_a_cobrar', 'tipo_pago',
  'repartidor_id', 'repartidor_asignado_en',
  'problema_descripcion', 'problema_fecha',
  'tags', 'tarifa_id', 'fecha',
  'eliminado', 'eliminado_por', 'eliminado_en', 'motivo_eliminacion',
  'created_at', 'updated_at',
].join(', ');

function mapEnvioRow(row: EnvioRow): Envio {
  return {
    id: row.id,
    trackingNumber: row.tracking_number,
    clienteId: row.cliente_id,
    clienteNombre: row.cliente_nombre,
    codigoReferencia: row.codigo_referencia,
    origen: row.origen,
    destino: row.destino,
    destinatarioNombre: row.destinatario_nombre,
    destinatarioDireccion: row.destinatario_direccion,
    destinatarioTelefono: row.destinatario_telefono,
    destinatarioTelefono2: row.destinatario_telefono2,
    destinatarioCedula: row.destinatario_cedula,
    destinatarioCiudad: row.destinatario_ciudad,
    destinatarioDepartamento: row.destinatario_departamento,
    destinatarioBarrio: row.destinatario_barrio,
    destinatarioReferencia: row.destinatario_referencia,
    destinatarioUbicacionUrl: row.destinatario_ubicacion_url,
    cantidad: row.cantidad,
    producto: row.producto,
    peso: row.peso,
    dimensiones: {
      largo: row.dimensiones_largo,
      ancho: row.dimensiones_ancho,
      alto: row.dimensiones_alto,
    },
    fragil: row.fragil,
    valorDeclarado: row.valor_declarado,
    instruccionesEntrega: row.instrucciones_entrega,
    horarioEntrega: row.horario_entrega,
    notas: row.notas,
    estado: row.estado,
    costo: row.costo,
    montoACobrar: row.monto_a_cobrar,
    tipoPago: row.tipo_pago,
    repartidorId: row.repartidor_id,
    repartidorAsignadoEn: row.repartidor_asignado_en,
    problemaDescripcion: row.problema_descripcion,
    problemaFecha: row.problema_fecha,
    tags: row.tags,
    tarifaId: row.tarifa_id,
    fecha: row.fecha,
    eventos: [],
    pago: null,
    notasInternas: [],
    creadoEn: row.created_at,
  };
}

// GET /: my envios (paginated + filters)

router.get(
  '/',
  validate({ query: envioQuerySchema }),
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;
    const { limit, page = 1, search, estado, fechaDesde, fechaHasta } = req.query as unknown as EnvioQuery;
    const offset = (page - 1) * limit;

    let q = supabase
      .from('envios')
      .select(ENVIO_COLUMNS, { count: 'exact' })
      .eq('cliente_id', clienteId)
      .eq('eliminado', false);

    if (estado) q = q.eq('estado', estado);
    if (fechaDesde) q = q.gte('fecha', fechaDesde);
    if (fechaHasta) q = q.lte('fecha', fechaHasta);
    if (search) {
      const s = escapeLikePattern(search);
      q = q.or(`tracking_number.ilike.%${s}%,destinatario_nombre.ilike.%${s}%,codigo_referencia.ilike.%${s}%`);
    }

    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await q;

    if (error) {
      logger.error({ error, clienteId }, 'Error fetching client envios');
      throw new AppError(`Error fetching envios: ${error.message}`, 500, 'DB_ERROR');
    }

    const rows = (data ?? []) as unknown as EnvioRow[];

    res.json({
      data: rows.map(mapEnvioRow),
      pagination: {
        total: count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((count ?? 0) / limit),
        hasMore: offset + limit < (count ?? 0),
        nextCursor: null,
      },
    });
  })
);

// GET /:id: envio detail (only if mine)

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;
    const id = req.params['id'] as string;

    const { data: envioData, error: envioError } = await supabase
      .from('envios')
      .select(ENVIO_COLUMNS)
      .eq('id', id)
      .eq('cliente_id', clienteId)
      .eq('eliminado', false)
      .single();

    if (envioError) {
      if (envioError.code === 'PGRST116') {
        throw AppError.notFound('Envio', id);
      }
      throw new AppError(`Error fetching envio: ${envioError.message}`, 500, 'DB_ERROR');
    }

    const envio = mapEnvioRow(envioData as unknown as EnvioRow);

    const { data: eventosData } = await supabase
      .from('eventos_envio')
      .select('id, envio_id, estado, descripcion, ubicacion, created_at')
      .eq('envio_id', id)
      .order('created_at', { ascending: false });

    if (eventosData) {
      envio.eventos = (eventosData as EventoEnvioRow[]).map((e) => ({
        id: e.id,
        envioId: e.envio_id,
        estado: e.estado,
        descripcion: e.descripcion,
        ubicacion: e.ubicacion,
        creadoEn: e.created_at,
      }));
    }

    const { data: pagoData } = await supabase
      .from('pagos')
      .select('id, envio_id, monto_total, monto_recibido, metodo_pago, estado_pago, fecha_pago, referencia, notas, creado_por, created_at, updated_at')
      .eq('envio_id', id)
      .single();

    if (pagoData) {
      const p = pagoData as PagoRow;
      envio.pago = {
        id: p.id,
        envioId: p.envio_id,
        montoTotal: p.monto_total,
        montoRecibido: p.monto_recibido,
        metodoPago: p.metodo_pago,
        estadoPago: p.estado_pago,
        fechaPago: p.fecha_pago,
        referencia: p.referencia,
        notas: p.notas,
        creadoPor: p.creado_por,
        creadoEn: p.created_at,
        updatedAt: p.updated_at,
      };
    }

    res.json(envio);
  })
);

// POST /: create envio (clienteId from auth)

router.post(
  '/',
  validate({ body: createEnvioSchema }),
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;
    const input = req.body as CreateEnvioInput;

    const { data: clienteData, error: clienteError } = await supabase
      .from('clientes')
      .select('razon_social, estado, eliminado')
      .eq('id', clienteId)
      .single();

    if (clienteError || !clienteData) {
      throw AppError.notFound('Cliente no encontrado');
    }
    if ((clienteData as { eliminado: boolean }).eliminado) {
      throw AppError.forbidden('La cuenta del cliente esta eliminada');
    }
    if ((clienteData as { estado: string }).estado !== 'activo') {
      throw AppError.forbidden('La cuenta del cliente no esta activa');
    }

    const clienteNombre = (clienteData as { razon_social: string }).razon_social;

    const trackingNumber = await generateTrackingNumber(supabase);

    const envioInsert = {
      tracking_number: trackingNumber,
      cliente_id: clienteId,
      cliente_nombre: clienteNombre,
      codigo_referencia: input.codigoReferencia ?? null,
      origen: input.origen,
      destino: input.destino,
      destinatario_nombre: input.destinatarioNombre,
      destinatario_direccion: input.destinatarioDireccion,
      destinatario_telefono: input.destinatarioTelefono,
      destinatario_telefono2: input.destinatarioTelefono2 ?? null,
      destinatario_cedula: input.destinatarioCedula ?? null,
      destinatario_ciudad: input.destinatarioCiudad,
      destinatario_departamento: input.destinatarioDepartamento ?? '',
      destinatario_barrio: input.destinatarioBarrio ?? null,
      destinatario_referencia: input.destinatarioReferencia ?? null,
      destinatario_ubicacion_url: input.destinatarioUbicacionUrl ?? null,
      cantidad: input.cantidad,
      producto: input.producto ?? '',
      peso: input.peso,
      dimensiones_largo: input.dimensiones?.largo ?? null,
      dimensiones_ancho: input.dimensiones?.ancho ?? null,
      dimensiones_alto: input.dimensiones?.alto ?? null,
      fragil: input.fragil,
      valor_declarado: input.valorDeclarado ?? 0,
      instrucciones_entrega: input.instruccionesEntrega ?? null,
      horario_entrega: input.horarioEntrega ?? null,
      notas: input.notas ?? null,
      estado: 'pendiente' as const,
      costo: input.costo,
      monto_a_cobrar: input.montoACobrar,
      tipo_pago: input.tipoPago,
      tags: input.tags ?? [],
      tarifa_id: input.tarifaId ?? null,
      fecha: new Date().toISOString().split('T')[0],
    };

    const { data: insertedData, error: insertError } = await supabase
      .from('envios')
      .insert(envioInsert)
      .select(ENVIO_COLUMNS)
      .single();

    if (insertError) {
      logger.error({ error: insertError, clienteId }, 'Error creating envio');
      throw new AppError(`Error creating envio: ${insertError.message}`, 500, 'DB_ERROR');
    }

    const envio = mapEnvioRow(insertedData as unknown as EnvioRow);

    await supabase.from('eventos_envio').insert({
      envio_id: envio.id,
      estado: 'pendiente',
      descripcion: 'Envio creado desde portal cliente',
    });

    emailService.sendEnvioCreado(envio);

    sseService.broadcastToRole({ entity: ['envios', 'list'], action: 'created' }, 'admin');
    sseService.broadcastToRole({ entity: ['dashboard'], action: 'updated' }, 'admin');

    res.status(201).json(envio);
  })
);

// POST /bulk-import: bulk CSV import

router.post(
  '/bulk-import',
  bulkLimiter,
  validate({ body: bulkImportSchema }),
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;
    const { envios } = req.body as { envios: CreateEnvioInput[] };

    const { data: clienteData, error: clienteError } = await supabase
      .from('clientes')
      .select('razon_social')
      .eq('id', clienteId)
      .single();

    if (clienteError || !clienteData) {
      throw AppError.notFound('Cliente', clienteId);
    }

    const clienteNombre = (clienteData as { razon_social: string }).razon_social;

    const results: Array<{ trackingNumber: string; id: string }> = [];
    const errors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < envios.length; i++) {
      try {
        const input = envios[i]!;
        const trackingNumber = await generateTrackingNumber(supabase);

        const envioInsert = {
          tracking_number: trackingNumber,
          cliente_id: clienteId,
          cliente_nombre: clienteNombre,
          codigo_referencia: input.codigoReferencia ?? null,
          origen: input.origen,
          destino: input.destino,
          destinatario_nombre: input.destinatarioNombre,
          destinatario_direccion: input.destinatarioDireccion,
          destinatario_telefono: input.destinatarioTelefono,
          destinatario_telefono2: input.destinatarioTelefono2 ?? null,
          destinatario_cedula: input.destinatarioCedula ?? null,
          destinatario_ciudad: input.destinatarioCiudad,
          destinatario_departamento: input.destinatarioDepartamento ?? '',
          destinatario_barrio: input.destinatarioBarrio ?? null,
          destinatario_referencia: input.destinatarioReferencia ?? null,
          destinatario_ubicacion_url: input.destinatarioUbicacionUrl ?? null,
          cantidad: input.cantidad,
          producto: input.producto ?? '',
          peso: input.peso,
          dimensiones_largo: input.dimensiones?.largo ?? null,
          dimensiones_ancho: input.dimensiones?.ancho ?? null,
          dimensiones_alto: input.dimensiones?.alto ?? null,
          fragil: input.fragil,
          valor_declarado: input.valorDeclarado ?? 0,
          instrucciones_entrega: input.instruccionesEntrega ?? null,
          horario_entrega: input.horarioEntrega ?? null,
          notas: input.notas ?? null,
          estado: 'pendiente' as const,
          costo: input.costo,
          monto_a_cobrar: input.montoACobrar,
          tipo_pago: input.tipoPago,
          tags: input.tags ?? [],
          tarifa_id: input.tarifaId ?? null,
          fecha: new Date().toISOString().split('T')[0],
        };

        const { data: insertedData, error: insertError } = await supabase
          .from('envios')
          .insert(envioInsert)
          .select('id')
          .single();

        if (insertError) {
          errors.push({ index: i, error: insertError.message });
          continue;
        }

        const insertedId = (insertedData as { id: string }).id;

        await supabase.from('eventos_envio').insert({
          envio_id: insertedId,
          estado: 'pendiente',
          descripcion: 'Envio creado por importacion masiva',
        });

        results.push({ trackingNumber, id: insertedId });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        errors.push({ index: i, error: errorMessage });
      }
    }

    sseService.broadcastToRole({ entity: ['envios', 'list'], action: 'bulk_created' }, 'admin');
    sseService.broadcastToRole({ entity: ['dashboard'], action: 'updated' }, 'admin');

    res.status(201).json({
      imported: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  })
);

export default router;
