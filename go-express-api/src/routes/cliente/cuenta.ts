import { Router } from 'express';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { supabase } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { updateClienteCuentaSchema } from '../../lib/validators/cliente.schema.js';
import type { ClienteRow, Cliente } from '../../types/index.js';
import type { UpdateClienteCuentaInput } from '../../lib/validators/cliente.schema.js';

const router = Router();

const CLIENTE_COLUMNS = 'id, auth_id, razon_social, ruc, contacto_nombre, contacto_cargo, telefono, email, direccion, ciudad, estado, plan, saldo_cuenta_corriente, limite_credito, total_envios, envios_activos, notas, portal_activo, portal_status, portal_invited_at, eliminado, eliminado_por, eliminado_en, motivo_eliminacion, created_at, updated_at';

function mapClienteRow(row: ClienteRow): Cliente {
  return {
    id: row.id,
    razonSocial: row.razon_social,
    ruc: row.ruc,
    contactoNombre: row.contacto_nombre,
    contactoCargo: row.contacto_cargo,
    telefono: row.telefono,
    email: row.email,
    direccion: row.direccion,
    ciudad: row.ciudad,
    estado: row.estado,
    plan: row.plan,
    saldoCuentaCorriente: row.saldo_cuenta_corriente,
    limiteCredito: row.limite_credito,
    totalEnvios: row.total_envios,
    enviosActivos: row.envios_activos,
    notas: row.notas,
    portalActivo: row.portal_activo,
    portalStatus: row.portal_status,
    portalInvitedAt: row.portal_invited_at,
    eliminado: row.eliminado,
    eliminadoPor: row.eliminado_por,
    eliminadoEn: row.eliminado_en,
    motivoEliminacion: row.motivo_eliminacion,
    creadoEn: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /: my company details

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;

    const { data, error } = await supabase
      .from('clientes')
      .select(CLIENTE_COLUMNS)
      .eq('id', clienteId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw AppError.notFound('Cliente', clienteId);
      }
      logger.error({ error, clienteId }, 'Error fetching client account');
      throw new AppError(`Error fetching account: ${error.message}`, 500, 'DB_ERROR');
    }

    res.json(mapClienteRow(data as ClienteRow));
  })
);

// PUT /: update my company details

router.put(
  '/',
  validate({ body: updateClienteCuentaSchema }),
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;
    const input = req.body as UpdateClienteCuentaInput;

    if (input.email !== undefined) {
      const { data: existing } = await supabase
        .from('clientes')
        .select('id')
        .eq('email', input.email)
        .eq('eliminado', false)
        .neq('id', clienteId)
        .maybeSingle();

      if (existing) {
        throw AppError.conflict('Ya existe otro cliente con ese email');
      }
    }

    const updateData: Record<string, unknown> = {};

    if (input.razonSocial !== undefined) updateData['razon_social'] = input.razonSocial;
    if (input.contactoNombre !== undefined) updateData['contacto_nombre'] = input.contactoNombre;
    if (input.contactoCargo !== undefined) updateData['contacto_cargo'] = input.contactoCargo;
    if (input.telefono !== undefined) updateData['telefono'] = input.telefono;
    if (input.email !== undefined) updateData['email'] = input.email;
    if (input.direccion !== undefined) updateData['direccion'] = input.direccion;
    if (input.ciudad !== undefined) updateData['ciudad'] = input.ciudad;
    if (input.notas !== undefined) updateData['notas'] = input.notas;

    const { data, error } = await supabase
      .from('clientes')
      .update(updateData)
      .eq('id', clienteId)
      .select(CLIENTE_COLUMNS)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw AppError.notFound('Cliente', clienteId);
      }
      logger.error({ error, clienteId }, 'Error updating client account');
      throw new AppError(`Error updating account: ${error.message}`, 500, 'DB_ERROR');
    }

    res.json(mapClienteRow(data as ClienteRow));
  })
);

export default router;
