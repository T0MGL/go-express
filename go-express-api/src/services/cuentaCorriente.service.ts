import { supabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import { auditoriaService } from './auditoria.service.js';
import type {
  MovimientoCc,
  MovimientoCcRow,
  PaginatedResponse,
  SaldoCuentaCorriente,
  TipoMovimientoCc,
} from '../types/index.js';
import type {
  CrearAjusteInput,
  CrearNotaCreditoInput,
  MovimientoQuery,
} from '../lib/validators/cuentaCorriente.schema.js';

const MOVIMIENTO_COLUMNS = [
  'id',
  'cliente_id',
  'envio_id',
  'pago_id',
  'tipo',
  'monto',
  'saldo_posterior',
  'descripcion',
  'creado_por',
  'ip_address',
  'user_agent',
  'created_at',
].join(', ');

function mapMovimientoRowToApi(row: MovimientoCcRow): MovimientoCc {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    envioId: row.envio_id,
    pagoId: row.pago_id,
    tipo: row.tipo,
    monto: row.monto,
    saldoPosterior: row.saldo_posterior,
    descripcion: row.descripcion,
    creadoPor: row.creado_por,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    creadoEn: row.created_at,
  };
}

interface RegistrarMovimientoArgs {
  clienteId: string;
  tipo: TipoMovimientoCc;
  monto: number;
  descripcion: string;
  creadoPor: string;
  envioId?: string | null;
  pagoId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

class CuentaCorrienteService {
  /**
   * Registra un movimiento atomicamente invocando la funcion Postgres registrar_movimiento_cc,
   * que lockea la fila del cliente con SELECT FOR UPDATE antes de calcular el saldo posterior.
   * Unica via sancionada para mutar clientes.saldo_cuenta_corriente desde backend.
   */
  async registrarMovimiento(args: RegistrarMovimientoArgs): Promise<MovimientoCc> {
    const { data, error } = await supabase.rpc('registrar_movimiento_cc', {
      p_cliente_id: args.clienteId,
      p_envio_id: args.envioId ?? null,
      p_pago_id: args.pagoId ?? null,
      p_tipo: args.tipo,
      p_monto: args.monto,
      p_descripcion: args.descripcion,
      p_creado_por: args.creadoPor,
      p_ip: args.ipAddress ?? null,
      p_user_agent: args.userAgent ?? null,
    });

    if (error || !data) {
      const msg = error?.message ?? 'desconocido';

      if (msg.includes('limite_credito_excedido')) {
        throw AppError.unprocessable(
          'El movimiento excede el limite de credito configurado para el cliente',
          'limite_credito_excedido'
        );
      }

      if (msg.includes('cliente') && msg.includes('no existe')) {
        throw AppError.notFound('Cliente', args.clienteId);
      }

      logger.error({ error, args }, 'Error registrando movimiento de cuenta corriente');
      throw new AppError(
        `Error registrando movimiento: ${msg}`,
        500,
        'DB_ERROR'
      );
    }

    return mapMovimientoRowToApi(data as unknown as MovimientoCcRow);
  }

  async getSaldo(clienteId: string): Promise<SaldoCuentaCorriente> {
    const { data, error } = await supabase
      .from('clientes')
      .select('saldo_cuenta_corriente, limite_credito, updated_at')
      .eq('id', clienteId)
      .eq('eliminado', false)
      .single();

    if (error || !data) {
      throw AppError.notFound('Cliente', clienteId);
    }

    const row = data as {
      saldo_cuenta_corriente: number;
      limite_credito: number;
      updated_at: string;
    };

    const { data: ultimoMov } = await supabase
      .from('movimientos_cuenta_corriente')
      .select('created_at')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const ultimaActualizacion = ultimoMov
      ? (ultimoMov as { created_at: string }).created_at
      : null;

    const disponible = row.limite_credito > 0
      ? row.limite_credito - row.saldo_cuenta_corriente
      : null;

    return {
      saldo: row.saldo_cuenta_corriente,
      limiteCredito: row.limite_credito,
      disponible,
      ultimaActualizacion,
    };
  }

  async listMovimientos(
    clienteId: string,
    filters: MovimientoQuery
  ): Promise<PaginatedResponse<MovimientoCc>> {
    const { limit, page = 1, tipo, envioId, fechaDesde, fechaHasta } = filters;
    const offset = (page - 1) * limit;

    let q = supabase
      .from('movimientos_cuenta_corriente')
      .select(MOVIMIENTO_COLUMNS, { count: 'exact' })
      .eq('cliente_id', clienteId);

    if (tipo) q = q.eq('tipo', tipo);
    if (envioId) q = q.eq('envio_id', envioId);
    if (fechaDesde) q = q.gte('created_at', `${fechaDesde}T00:00:00`);
    if (fechaHasta) q = q.lte('created_at', `${fechaHasta}T23:59:59.999`);

    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await q;

    if (error) {
      logger.error({ error, clienteId }, 'Error listando movimientos cuenta corriente');
      throw new AppError('Error listando movimientos', 500, 'DB_ERROR');
    }

    const rows = (data ?? []) as unknown as MovimientoCcRow[];

    return {
      data: rows.map(mapMovimientoRowToApi),
      pagination: {
        total: count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((count ?? 0) / limit),
        hasMore: offset + limit < (count ?? 0),
        nextCursor: null,
      },
    };
  }

  async exportMovimientos(
    clienteId: string,
    filters: MovimientoQuery
  ): Promise<MovimientoCc[]> {
    const { tipo, envioId, fechaDesde, fechaHasta } = filters;

    let q = supabase
      .from('movimientos_cuenta_corriente')
      .select(MOVIMIENTO_COLUMNS)
      .eq('cliente_id', clienteId);

    if (tipo) q = q.eq('tipo', tipo);
    if (envioId) q = q.eq('envio_id', envioId);
    if (fechaDesde) q = q.gte('created_at', `${fechaDesde}T00:00:00`);
    if (fechaHasta) q = q.lte('created_at', `${fechaHasta}T23:59:59.999`);

    q = q.order('created_at', { ascending: false }).limit(10000);

    const { data, error } = await q;

    if (error) {
      throw new AppError('Error exportando movimientos', 500, 'DB_ERROR');
    }

    return ((data ?? []) as unknown as MovimientoCcRow[]).map(mapMovimientoRowToApi);
  }

  async crearAjuste(
    clienteId: string,
    input: CrearAjusteInput,
    creadoPor: string,
    creadoPorNombre: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<MovimientoCc> {
    await this.ensureClienteActivo(clienteId);

    const movimiento = await this.registrarMovimiento({
      clienteId,
      tipo: 'ajuste',
      monto: input.monto,
      descripcion: input.descripcion,
      creadoPor,
      envioId: input.envioId ?? null,
      pagoId: null,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });

    await auditoriaService.log({
      usuario: creadoPorNombre,
      usuarioId: creadoPor,
      accion: 'ajuste',
      entidad: 'cuenta_corriente',
      entidadId: movimiento.id,
      descripcion: `Ajuste de cuenta corriente (${input.monto > 0 ? 'debito' : 'credito'} de ${Math.abs(input.monto)} Gs): ${input.descripcion}`,
      valorNuevo: { monto: input.monto, saldoPosterior: movimiento.saldoPosterior },
      ipAddress,
      userAgent,
    });

    return movimiento;
  }

  async crearNotaCredito(
    clienteId: string,
    input: CrearNotaCreditoInput,
    creadoPor: string,
    creadoPorNombre: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<MovimientoCc> {
    await this.ensureClienteActivo(clienteId);

    const montoNegativo = -input.monto;

    const movimiento = await this.registrarMovimiento({
      clienteId,
      tipo: 'nota_credito',
      monto: montoNegativo,
      descripcion: input.descripcion,
      creadoPor,
      envioId: input.envioId ?? null,
      pagoId: null,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });

    await auditoriaService.log({
      usuario: creadoPorNombre,
      usuarioId: creadoPor,
      accion: 'nota_credito',
      entidad: 'cuenta_corriente',
      entidadId: movimiento.id,
      descripcion: `Nota de credito por ${input.monto} Gs: ${input.descripcion}`,
      valorNuevo: { monto: montoNegativo, saldoPosterior: movimiento.saldoPosterior },
      ipAddress,
      userAgent,
    });

    return movimiento;
  }

  /**
   * Evalua si el cliente puede incurrir en montoAdicional de deuda adicional sin exceder
   * su limite de credito. Contrato:
   *   - limite_credito = 0 -> no hay restriccion configurada, retorna true (admin no
   *     definio limite todavia, no bloqueamos operaciones)
   *   - limite_credito > 0 -> saldo_actual + montoAdicional <= limite_credito
   *
   * Esta chequeo es advisory: la decision final se toma en el POST de envio, bajo lock
   * pesimista via la propia funcion registrar_movimiento_cc. Entre este check y el insert
   * puede haber race window, por eso siempre se complementa con la validacion atomica en
   * la creacion del movimiento.
   */
  async verificarLimiteCredito(
    clienteId: string,
    montoAdicional: number
  ): Promise<{ permitido: boolean; saldoActual: number; limiteCredito: number; disponible: number | null }> {
    const { data, error } = await supabase
      .from('clientes')
      .select('saldo_cuenta_corriente, limite_credito')
      .eq('id', clienteId)
      .eq('eliminado', false)
      .single();

    if (error || !data) {
      throw AppError.notFound('Cliente', clienteId);
    }

    const row = data as { saldo_cuenta_corriente: number; limite_credito: number };
    const saldoActual = row.saldo_cuenta_corriente;
    const limiteCredito = row.limite_credito;

    if (limiteCredito === 0) {
      return {
        permitido: true,
        saldoActual,
        limiteCredito,
        disponible: null,
      };
    }

    const saldoProyectado = saldoActual + montoAdicional;
    const permitido = saldoProyectado <= limiteCredito;
    const disponible = limiteCredito - saldoActual;

    return { permitido, saldoActual, limiteCredito, disponible };
  }

  async updateLimiteCredito(
    clienteId: string,
    limiteCredito: number,
    motivo: string,
    userId: string,
    userName: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ limiteCredito: number; limiteAnterior: number }> {
    const { data: existing, error: fetchErr } = await supabase
      .from('clientes')
      .select('id, limite_credito, razon_social')
      .eq('id', clienteId)
      .eq('eliminado', false)
      .single();

    if (fetchErr || !existing) {
      throw AppError.notFound('Cliente', clienteId);
    }

    const existingRow = existing as { id: string; limite_credito: number; razon_social: string };
    const limiteAnterior = existingRow.limite_credito;

    const { error: updateErr } = await supabase
      .from('clientes')
      .update({ limite_credito: limiteCredito })
      .eq('id', clienteId);

    if (updateErr) {
      throw new AppError('Error actualizando limite de credito', 500, 'DB_ERROR');
    }

    await auditoriaService.log({
      usuario: userName,
      usuarioId: userId,
      accion: 'editar',
      entidad: 'cuenta_corriente',
      entidadId: clienteId,
      descripcion: `Limite de credito de ${existingRow.razon_social}: ${limiteAnterior} -> ${limiteCredito} Gs. Motivo: ${motivo}`,
      valorAnterior: { limiteCredito: limiteAnterior },
      valorNuevo: { limiteCredito },
      ipAddress,
      userAgent,
    });

    return { limiteCredito, limiteAnterior };
  }

  private async ensureClienteActivo(clienteId: string): Promise<void> {
    const { data, error } = await supabase
      .from('clientes')
      .select('id, estado, eliminado')
      .eq('id', clienteId)
      .single();

    if (error || !data) {
      throw AppError.notFound('Cliente', clienteId);
    }

    const row = data as { id: string; estado: string; eliminado: boolean };
    if (row.eliminado) {
      throw AppError.badRequest('Cliente eliminado, no se pueden registrar movimientos');
    }
    if (row.estado === 'suspendido') {
      throw AppError.badRequest('Cliente suspendido, no se pueden registrar movimientos');
    }
  }
}

export const cuentaCorrienteService = new CuentaCorrienteService();
