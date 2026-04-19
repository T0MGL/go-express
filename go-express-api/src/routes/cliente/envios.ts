import { Router } from 'express';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { supabase } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { emailService } from '../../services/email.service.js';
import { sseService } from '../../services/sse.service.js';
import { computeSeguroForEnvio } from '../../services/envio.service.js';
import { cuentaCorrienteService } from '../../services/cuentaCorriente.service.js';
import { parseSeguroConfig, calcularSeguroAdicional, puedeAsegurar } from '../../lib/seguro.js';
import { generateTrackingNumber } from '../../lib/trackingNumber.js';
import { todayPY } from '../../lib/datetime.js';
import { calcularCosto } from '../../lib/volumetric.js';
import { normalizeCiudad } from '../../lib/ciudad.js';
import { bulkLimiter } from '../../middleware/rateLimit.js';
import {
  createEnvioSchema,
  createClienteEnvioSchema,
  envioQuerySchema,
  bulkImportSchema,
} from '../../lib/validators/envio.schema.js';
import { escapeLikePattern } from '../../lib/validators/common.schema.js';
import { idParamSchema } from '../../lib/validators/common.schema.js';
import type { EnvioRow, EventoEnvioRow, PagoRow, Envio, TarifaRow } from '../../types/index.js';
import type {
  CreateEnvioInput,
  CreateClienteEnvioInput,
  EnvioQuery,
} from '../../lib/validators/envio.schema.js';

const router = Router();

const ENVIO_COLUMNS = [
  'id', 'tracking_number', 'cliente_id', 'cliente_nombre', 'codigo_referencia',
  'origen', 'destino',
  'destinatario_nombre', 'destinatario_direccion', 'destinatario_telefono',
  'destinatario_telefono2', 'destinatario_cedula',
  'destinatario_ciudad', 'destinatario_departamento', 'destinatario_barrio',
  'destinatario_referencia', 'destinatario_ubicacion_url', 'destinatario_email',
  'cantidad', 'producto', 'peso',
  'dimensiones_largo', 'dimensiones_ancho', 'dimensiones_alto',
  'fragil', 'valor_declarado', 'instrucciones_entrega', 'horario_entrega', 'notas',
  'estado', 'costo', 'monto_a_cobrar', 'tipo_pago',
  'seguro_adicional', 'costo_seguro',
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
    destinatarioEmail: row.destinatario_email,
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
    seguroAdicional: row.seguro_adicional,
    costoSeguro: row.costo_seguro,
    repartidorId: row.repartidor_id,
    repartidorAsignadoEn: row.repartidor_asignado_en,
    problemaDescripcion: row.problema_descripcion,
    problemaFecha: row.problema_fecha,
    fotoEntregaUrl: row.foto_entrega_url ?? null,
    entregadoPorNombre: row.entregado_por_nombre ?? null,
    entregadoPorDocumento: row.entregado_por_documento ?? null,
    fechaEntregaReal: row.fecha_entrega_real ?? null,
    montoCobrado: row.monto_cobrado ?? null,
    recolectadoEn: row.recolectado_en ?? null,
    entregaNotas: row.entrega_notas ?? null,
    tieneIncidencia: row.tiene_incidencia ?? false,
    incidenciaNota: row.incidencia_nota ?? null,
    incidenciaReportadaEn: row.incidencia_reportada_en ?? null,
    incidenciaReportadaPor: row.incidencia_reportada_por ?? null,
    tags: row.tags,
    tarifaId: row.tarifa_id,
    fecha: row.fecha,
    eliminado: row.eliminado,
    eliminadoPor: row.eliminado_por,
    eliminadoEn: row.eliminado_en,
    motivoEliminacion: row.motivo_eliminacion,
    eventos: [],
    pago: null,
    notasInternas: [],
    creadoEn: row.created_at,
    updatedAt: row.updated_at,
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
      logger.error({ error, clienteId }, 'Error fetching client envíos');
      throw new AppError(`Error fetching envíos: ${error.message}`, 500, 'DB_ERROR');
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
        throw AppError.notFound('Envío', id);
      }
      throw new AppError(`Error fetching envío: ${envioError.message}`, 500, 'DB_ERROR');
    }

    const envio = mapEnvioRow(envioData as unknown as EnvioRow);

    const [eventosResult, pagoResult] = await Promise.all([
      supabase
        .from('eventos_envio')
        .select('id, envio_id, estado, descripcion, ubicacion, created_at')
        .eq('envio_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('pagos')
        .select('id, envio_id, monto_total, monto_recibido, metodo_pago, estado_pago, fecha_pago, referencia, notas, creado_por, created_at, updated_at')
        .eq('envio_id', id)
        .maybeSingle(),
    ]);

    if (eventosResult.data) {
      envio.eventos = (eventosResult.data as EventoEnvioRow[]).map((e) => ({
        id: e.id,
        envioId: e.envio_id,
        estado: e.estado,
        descripcion: e.descripcion,
        ubicacion: e.ubicacion,
        creadoEn: e.created_at,
      }));
    }

    if (pagoResult.data) {
      const p = pagoResult.data as PagoRow;
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
// El cliente solo manda destinatario + paquete. El server deriva:
//   - clienteId desde req.clienteId
//   - origen desde cliente.ciudad (fallback 'Asuncion')
//   - destino desde destinatarioCiudad o destinatarioDepartamento
//   - costo + tarifaId buscando la tarifa activa que matchee origen/destino (si no hay, costo=0 y admin lo setea)
//   - tipoPago = 'cuenta_corriente' (cliente portal siempre factura a cuenta)

router.post(
  '/',
  validate({ body: createClienteEnvioSchema }),
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;
    const input = req.body as CreateClienteEnvioInput;

    const { data: clienteData, error: clienteError } = await supabase
      .from('clientes')
      .select('razon_social, ciudad, estado, eliminado')
      .eq('id', clienteId)
      .single();

    if (clienteError || !clienteData) {
      throw AppError.notFound('Cliente no encontrado');
    }
    const clienteRow = clienteData as {
      razon_social: string;
      ciudad: string | null;
      estado: string;
      eliminado: boolean;
    };
    if (clienteRow.eliminado) {
      throw AppError.forbidden('La cuenta del cliente esta eliminada');
    }
    if (clienteRow.estado !== 'activo') {
      throw AppError.forbidden('La cuenta del cliente no esta activa');
    }

    const clienteNombre = clienteRow.razon_social;

    const origenInput = clienteRow.ciudad?.trim() || 'Asuncion';
    const destinoInput = input.destinatarioCiudad.trim();
    const origenNorm = normalizeCiudad(origenInput);
    const destinoNorm = normalizeCiudad(destinoInput);

    // Buscar tarifa activa con match normalizado (tolera tildes/mayusculas entre
    // cliente.ciudad y lo que el admin haya cargado en tarifas). Si no hay match,
    // el envio se crea con costo 0 y el admin lo tasa despues (no bloqueamos al
    // cliente por configuracion faltante o mismatch de strings).
    let costo = 0;
    let tarifaId: string | null = null;
    let origen = origenInput;
    let destino = destinoInput;

    const { data: tarifasData, error: tarifaError } = await supabase
      .from('tarifas')
      .select('id, origen, destino, precio_base, peso_base, precio_por_kg_extra, factor_dimensional')
      .eq('activo', true)
      .eq('eliminado', false);

    if (tarifaError) {
      logger.warn({ error: tarifaError, origenInput, destinoInput, clienteId }, 'Error buscando tarifas para envio cliente, se crea con costo 0');
    } else {
      const tarifas = (tarifasData ?? []) as Array<Pick<TarifaRow, 'id' | 'origen' | 'destino' | 'precio_base' | 'peso_base' | 'precio_por_kg_extra' | 'factor_dimensional'>>;
      const tarifa = tarifas.find(
        (t) => normalizeCiudad(t.origen) === origenNorm && normalizeCiudad(t.destino) === destinoNorm
      );
      if (tarifa) {
        const hasDims = !!input.dimensiones && input.dimensiones.largo > 0 && input.dimensiones.ancho > 0 && input.dimensiones.alto > 0;
        costo = calcularCosto(
          {
            precioBase: tarifa.precio_base,
            pesoBase: tarifa.peso_base,
            precioPorKgExtra: tarifa.precio_por_kg_extra,
            factorDimensional: tarifa.factor_dimensional,
          },
          input.peso,
          hasDims ? input.dimensiones : undefined
        ).costoTotal;
        tarifaId = tarifa.id;
        // Guardar con la forma canonica de la tarifa, no con lo que mando el cliente.
        origen = tarifa.origen;
        destino = tarifa.destino;
      }
    }

    const destinatarioCiudad = destino;

    const trackingNumber = await generateTrackingNumber(supabase);

    const valorDeclarado = input.valorDeclarado ?? 0;
    const { seguroAdicional, costoSeguro } = await computeSeguroForEnvio(
      valorDeclarado,
      input.seguroAdicional
    );

    const hasDims = !!input.dimensiones && input.dimensiones.largo > 0 && input.dimensiones.ancho > 0 && input.dimensiones.alto > 0;

    // Cliente portal siempre factura a cuenta corriente, validar limite antes de insertar.
    // Este check es advisory: la atomicidad real ocurre en el trigger via FOR UPDATE.
    const montoFacturable = costo + costoSeguro;
    if (montoFacturable > 0) {
      const verif = await cuentaCorrienteService.verificarLimiteCredito(clienteId, montoFacturable);
      if (!verif.permitido) {
        throw AppError.unprocessable('limite_credito_excedido', {
          saldoActual: verif.saldoActual,
          limiteCredito: verif.limiteCredito,
          montoSolicitado: montoFacturable,
          disponible: verif.disponible,
        });
      }
    }

    const envioInsert = {
      tracking_number: trackingNumber,
      cliente_id: clienteId,
      cliente_nombre: clienteNombre,
      codigo_referencia: input.codigoReferencia ?? null,
      origen,
      destino,
      destinatario_nombre: input.destinatarioNombre,
      destinatario_direccion: input.destinatarioDireccion,
      destinatario_telefono: input.destinatarioTelefono,
      destinatario_telefono2: input.destinatarioTelefono2 ?? null,
      destinatario_cedula: input.destinatarioCedula ?? null,
      destinatario_ciudad: destinatarioCiudad,
      destinatario_departamento: input.destinatarioDepartamento ?? '',
      destinatario_barrio: input.destinatarioBarrio ?? null,
      destinatario_referencia: input.destinatarioReferencia ?? null,
      destinatario_ubicacion_url: input.destinatarioUbicacionUrl ?? null,
      destinatario_email: input.destinatarioEmail ?? null,
      cantidad: input.cantidad,
      producto: input.producto ?? '',
      peso: input.peso,
      dimensiones_largo: hasDims ? input.dimensiones!.largo : null,
      dimensiones_ancho: hasDims ? input.dimensiones!.ancho : null,
      dimensiones_alto: hasDims ? input.dimensiones!.alto : null,
      fragil: input.fragil,
      valor_declarado: valorDeclarado,
      instrucciones_entrega: input.instruccionesEntrega ?? null,
      horario_entrega: input.horarioEntrega ?? null,
      notas: input.notas ?? null,
      estado: 'pendiente' as const,
      costo,
      monto_a_cobrar: 0,
      tipo_pago: 'cuenta_corriente' as const,
      seguro_adicional: seguroAdicional,
      costo_seguro: costoSeguro,
      tags: input.tags ?? [],
      tarifa_id: tarifaId,
      fecha: todayPY(),
    };

    const { data: insertedData, error: insertError } = await supabase
      .from('envios')
      .insert(envioInsert)
      .select(ENVIO_COLUMNS)
      .single();

    if (insertError) {
      logger.error({ error: insertError, clienteId }, 'Error creating envío');
      throw new AppError(`Error creating envío: ${insertError.message}`, 500, 'DB_ERROR');
    }

    const envio = mapEnvioRow(insertedData as unknown as EnvioRow);

    await supabase.from('eventos_envio').insert({
      envio_id: envio.id,
      estado: 'pendiente',
      descripcion: 'Envío creado desde portal cliente',
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

    // Enforce clienteId from auth token on every envio in the batch
    for (const envio of envios) {
      envio.clienteId = clienteId;
    }

    const { data: clienteData, error: clienteError } = await supabase
      .from('clientes')
      .select('razon_social')
      .eq('id', clienteId)
      .single();

    if (clienteError || !clienteData) {
      throw AppError.notFound('Cliente', clienteId);
    }

    const clienteNombre = (clienteData as { razon_social: string }).razon_social;

    const trackingNumbers = await Promise.all(
      envios.map(() => generateTrackingNumber(supabase))
    );

    // Fetch seguro config ONCE for the whole batch to avoid N DB reads.
    const { data: seguroConfigData, error: seguroConfigError } = await supabase
      .from('configuracion')
      .select('value')
      .eq('key', 'seguro_config')
      .maybeSingle();

    if (seguroConfigError) {
      logger.error({ error: seguroConfigError }, 'Bulk import: error fetching seguro config');
      throw new AppError('Error fetching seguro config', 500, 'DB_ERROR');
    }

    const seguroConfig = parseSeguroConfig(
      (seguroConfigData as { value: unknown } | null)?.value ?? null
    );

    const today = todayPY();
    const insertRows = envios.map((input, i) => {
      const valorDeclarado = input.valorDeclarado ?? 0;

      if (valorDeclarado > seguroConfig.maximoAsegurable) {
        throw AppError.badRequest(
          `Envío #${i + 1}: valor declarado ${valorDeclarado} supera el máximo asegurable (${seguroConfig.maximoAsegurable} Gs)`
        );
      }

      let seguroAdicionalFlag = false;
      let costoSeguro = 0;
      if (input.seguroAdicional && puedeAsegurar(valorDeclarado, seguroConfig)) {
        seguroAdicionalFlag = true;
        costoSeguro = calcularSeguroAdicional(valorDeclarado, seguroConfig);
      }

      return {
        tracking_number: trackingNumbers[i]!,
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
        destinatario_email: input.destinatarioEmail ?? null,
        cantidad: input.cantidad,
        producto: input.producto ?? '',
        peso: input.peso,
        dimensiones_largo: input.dimensiones?.largo ?? null,
        dimensiones_ancho: input.dimensiones?.ancho ?? null,
        dimensiones_alto: input.dimensiones?.alto ?? null,
        fragil: input.fragil,
        valor_declarado: valorDeclarado,
        instrucciones_entrega: input.instruccionesEntrega ?? null,
        horario_entrega: input.horarioEntrega ?? null,
        notas: input.notas ?? null,
        estado: 'pendiente' as const,
        costo: input.costo,
        monto_a_cobrar: input.montoACobrar,
        tipo_pago: input.tipoPago,
        seguro_adicional: seguroAdicionalFlag,
        costo_seguro: costoSeguro,
        tags: input.tags ?? [],
        tarifa_id: input.tarifaId ?? null,
        fecha: today,
      };
    });

    // Batch insert all envios in a single query
    const { data: insertedData, error: insertError } = await supabase
      .from('envios')
      .insert(insertRows)
      .select('id, tracking_number');

    const results: Array<{ trackingNumber: string; id: string }> = [];
    const errors: Array<{ index: number; error: string }> = [];

    if (insertError) {
      // If batch fails, entire batch is rejected
      logger.error({ error: insertError, clienteId }, 'Bulk import batch insert failed');
      throw new AppError(`Error importing envíos: ${insertError.message}`, 500, 'DB_ERROR');
    }

    const inserted = (insertedData ?? []) as Array<{ id: string; tracking_number: string }>;

    // Batch insert all eventos in a single query
    if (inserted.length > 0) {
      const eventRows = inserted.map((row) => ({
        envio_id: row.id,
        estado: 'pendiente' as const,
        descripcion: 'Envío creado por importación masiva',
      }));

      await supabase.from('eventos_envio').insert(eventRows);

      for (const row of inserted) {
        results.push({ trackingNumber: row.tracking_number, id: row.id });
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
