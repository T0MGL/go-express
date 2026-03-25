import { Router } from 'express';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { supabase } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { encryptionService } from '../../services/encryption.service.js';
import { updateClienteCuentaSchema } from '../../lib/validators/cliente.schema.js';
import type { ClienteRow, Cliente } from '../../types/index.js';
import type { UpdateClienteCuentaInput } from '../../lib/validators/cliente.schema.js';

const router = Router();


function mapClienteRow(row: ClienteRow): Cliente {
  return {
    id: row.id,
    razonSocial: row.razon_social,
    ruc: encryptionService.decrypt(row.ruc_enc),
    contactoNombre: encryptionService.decrypt(row.contacto_nombre_enc),
    contactoCargo: row.contacto_cargo,
    telefono: encryptionService.decrypt(row.telefono_enc),
    email: encryptionService.decrypt(row.email_enc),
    direccion: row.direccion_enc ? encryptionService.decrypt(row.direccion_enc) : null,
    ciudad: row.ciudad,
    estado: row.estado,
    plan: row.plan,
    saldoCuentaCorriente: row.saldo_cuenta_corriente,
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

// GET /: my company details (decrypted)

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;

    const CLIENTE_COLUMNS = 'id, auth_id, razon_social, ruc_enc, ruc_hash, contacto_nombre_enc, contacto_cargo, telefono_enc, email_enc, email_hash, direccion_enc, ciudad, estado, plan, saldo_cuenta_corriente, total_envios, envios_activos, notas, portal_activo, portal_status, portal_invited_at, eliminado, eliminado_por, eliminado_en, motivo_eliminacion, created_at, updated_at';

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

    const updateData: Record<string, unknown> = {};

    if (input.razonSocial !== undefined) updateData['razon_social'] = input.razonSocial;
    if (input.contactoNombre !== undefined) {
      updateData['contacto_nombre_enc'] = encryptionService.encrypt(input.contactoNombre);
    }
    if (input.contactoCargo !== undefined) updateData['contacto_cargo'] = input.contactoCargo;
    if (input.telefono !== undefined) {
      updateData['telefono_enc'] = encryptionService.encrypt(input.telefono);
    }
    if (input.email !== undefined) {
      updateData['email_enc'] = encryptionService.encrypt(input.email);
      updateData['email_hash'] = encryptionService.hashForSearch(input.email);
    }
    if (input.direccion !== undefined) {
      updateData['direccion_enc'] = encryptionService.encrypt(input.direccion);
    }
    if (input.ciudad !== undefined) updateData['ciudad'] = input.ciudad;
    if (input.notas !== undefined) updateData['notas'] = input.notas;

    // plan, estado, ruc are admin-only fields
    const { data, error } = await supabase
      .from('clientes')
      .update(updateData)
      .eq('id', clienteId)
      .select('id, auth_id, razon_social, ruc_enc, ruc_hash, contacto_nombre_enc, contacto_cargo, telefono_enc, email_enc, email_hash, direccion_enc, ciudad, estado, plan, saldo_cuenta_corriente, total_envios, envios_activos, notas, portal_activo, portal_status, portal_invited_at, eliminado, eliminado_por, eliminado_en, motivo_eliminacion, created_at, updated_at')
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
