import { supabase } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { encryptionService } from './encryption.service.js';
import { auditoriaService } from './auditoria.service.js';
import { logger } from '../config/logger.js';
import type {
  ClienteRow,
  Cliente,
  ClienteEstado,
  PaginatedResponse,
} from '../types/index.js';
import type { CreateClienteInput, UpdateClienteInput, ClienteQuery } from '../lib/validators/cliente.schema.js';
import { escapeLikePattern } from '../lib/validators/common.schema.js';

/**
 * Full mapper with decryption. Used ONLY for single-record detail views
 * (getById, create, update) where PII is needed.
 */
function toApi(row: ClienteRow): Cliente {
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

/**
 * Lightweight mapper for list views. Returns empty strings for PII fields
 * that are only needed in detail views. Zero decryption overhead.
 */
function toListApi(row: Record<string, unknown>): Cliente {
  return {
    id: row['id'] as string,
    razonSocial: row['razon_social'] as string,
    ruc: '',
    contactoNombre: '',
    contactoCargo: (row['contacto_cargo'] as string | null) ?? null,
    telefono: '',
    email: '',
    direccion: null,
    ciudad: (row['ciudad'] as string | null) ?? null,
    estado: row['estado'] as ClienteEstado,
    plan: row['plan'] as Cliente['plan'],
    saldoCuentaCorriente: row['saldo_cuenta_corriente'] as number,
    totalEnvios: row['total_envios'] as number,
    enviosActivos: row['envios_activos'] as number,
    notas: (row['notas'] as string | null) ?? null,
    portalActivo: row['portal_activo'] as boolean,
    portalStatus: row['portal_status'] as Cliente['portalStatus'],
    portalInvitedAt: (row['portal_invited_at'] as string | null) ?? null,
    eliminado: row['eliminado'] as boolean,
    eliminadoPor: (row['eliminado_por'] as string | null) ?? null,
    eliminadoEn: (row['eliminado_en'] as string | null) ?? null,
    motivoEliminacion: (row['motivo_eliminacion'] as string | null) ?? null,
    creadoEn: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}

// Full columns: includes encrypted fields for detail/create/update views
const CLIENTE_COLUMNS = [
  'id', 'auth_id', 'razon_social', 'ruc_enc', 'ruc_hash',
  'contacto_nombre_enc', 'contacto_cargo',
  'telefono_enc', 'email_enc', 'email_hash', 'direccion_enc',
  'ciudad', 'estado', 'plan',
  'saldo_cuenta_corriente', 'total_envios', 'envios_activos',
  'notas', 'portal_activo', 'portal_status', 'portal_invited_at',
  'eliminado', 'eliminado_por', 'eliminado_en', 'motivo_eliminacion',
  'created_at', 'updated_at',
].join(', ');

// Lightweight columns: skips encrypted fields to avoid decryption on list views.
// The list only needs display-ready, non-PII data.
const CLIENTE_LIST_COLUMNS = [
  'id', 'razon_social', 'contacto_cargo',
  'ciudad', 'estado', 'plan',
  'saldo_cuenta_corriente', 'total_envios', 'envios_activos',
  'notas', 'portal_activo', 'portal_status', 'portal_invited_at',
  'eliminado', 'eliminado_por', 'eliminado_en', 'motivo_eliminacion',
  'created_at', 'updated_at',
].join(', ');

class ClienteService {
  async list(query: ClienteQuery): Promise<PaginatedResponse<Cliente>> {
    const { limit, page = 1, search, estado, plan } = query;
    const offset = (page - 1) * limit;

    let q = supabase
      .from('clientes')
      .select(CLIENTE_LIST_COLUMNS, { count: 'exact' })
      .eq('eliminado', false);

    if (estado) q = q.eq('estado', estado);
    if (plan) q = q.eq('plan', plan);
    if (search) {
      q = q.ilike('razon_social', `%${escapeLikePattern(search)}%`);
    }

    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await q;

    if (error) {
      throw new AppError('Error fetching clientes', 500, 'DB_ERROR');
    }

    const rows = (data ?? []) as unknown as Record<string, unknown>[];

    return {
      data: rows.map(toListApi),
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

  /**
   * Export with full PII decryption. Used ONLY for admin CSV export.
   * Intentionally uses full columns + toApi (with decryption) because
   * exports legitimately need real client data.
   */
  async exportList(query: ClienteQuery): Promise<Cliente[]> {
    const { search, estado, plan } = query;

    let q = supabase
      .from('clientes')
      .select(CLIENTE_COLUMNS)
      .eq('eliminado', false);

    if (estado) q = q.eq('estado', estado);
    if (plan) q = q.eq('plan', plan);
    if (search) {
      q = q.ilike('razon_social', `%${escapeLikePattern(search)}%`);
    }

    q = q.order('created_at', { ascending: false }).limit(10000);

    const { data, error } = await q;

    if (error) {
      throw new AppError('Error exporting clientes', 500, 'DB_ERROR');
    }

    return ((data ?? []) as unknown as ClienteRow[]).map(toApi);
  }

  async getById(id: string): Promise<Cliente> {
    const { data, error } = await supabase
      .from('clientes')
      .select(CLIENTE_COLUMNS)
      .eq('id', id)
      .eq('eliminado', false)
      .single();

    if (error || !data) {
      throw AppError.notFound('Cliente', id);
    }

    return toApi(data as unknown as ClienteRow);
  }

  async create(input: CreateClienteInput, userId: string): Promise<Cliente> {
    const rucHash = encryptionService.hashForSearch(input.ruc);
    const { data: existing } = await supabase
      .from('clientes')
      .select('id')
      .eq('ruc_hash', rucHash)
      .eq('eliminado', false)
      .maybeSingle();

    if (existing) {
      throw AppError.conflict('A client with this RUC already exists');
    }

    const emailHash = encryptionService.hashForSearch(input.email);
    const { data: existingEmail } = await supabase
      .from('clientes')
      .select('id')
      .eq('email_hash', emailHash)
      .eq('eliminado', false)
      .maybeSingle();

    if (existingEmail) {
      throw AppError.conflict('A client with this email already exists');
    }

    let data: unknown;
    try {
      const result = await supabase
        .from('clientes')
        .insert({
          razon_social: input.razonSocial,
          ruc_enc: encryptionService.encrypt(input.ruc),
          ruc_hash: rucHash,
          contacto_nombre_enc: encryptionService.encrypt(input.contactoNombre),
          contacto_cargo: input.contactoCargo ?? null,
          telefono_enc: encryptionService.encrypt(input.telefono),
          email_enc: encryptionService.encrypt(input.email),
          email_hash: emailHash,
          direccion_enc: input.direccion ? encryptionService.encrypt(input.direccion) : null,
          ciudad: input.ciudad,
          plan: input.plan,
          notas: input.notas ?? null,
        })
        .select()
        .single();

      if (result.error) {
        const msg = result.error.message ?? '';
        if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate')) {
          throw AppError.conflict('Ya existe un cliente con ese RUC o email');
        }
        throw new AppError('Error creating cliente', 500, 'DB_ERROR');
      }

      data = result.data;
      if (!data) {
        throw new AppError('Error creating cliente', 500, 'DB_ERROR');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate')) {
        throw AppError.conflict('Ya existe un cliente con ese RUC o email');
      }
      throw new AppError('Error creating cliente', 500, 'DB_ERROR');
    }

    const cliente = toApi(data as unknown as ClienteRow);

    await auditoriaService.log({
      usuario: 'Admin GoExpress',
      usuarioId: userId,
      accion: 'crear',
      entidad: 'cliente',
      entidadId: cliente.id,
      descripcion: `Cliente creado: ${cliente.razonSocial} (ID: ${cliente.id})`,
    });

    return cliente;
  }

  async update(id: string, input: UpdateClienteInput, userId?: string): Promise<Cliente> {
    const existing = await this.getById(id);
    if (existing.eliminado) {
      throw AppError.badRequest('Cannot update a deleted client');
    }

    const updateData: Record<string, unknown> = {};

    if (input.razonSocial !== undefined) updateData['razon_social'] = input.razonSocial;
    if (input.ruc !== undefined) {
      updateData['ruc_enc'] = encryptionService.encrypt(input.ruc);
      updateData['ruc_hash'] = encryptionService.hashForSearch(input.ruc);
    }
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
      updateData['direccion_enc'] = input.direccion ? encryptionService.encrypt(input.direccion) : null;
    }
    if (input.ciudad !== undefined) updateData['ciudad'] = input.ciudad;
    if (input.plan !== undefined) updateData['plan'] = input.plan;
    if (input.notas !== undefined) updateData['notas'] = input.notas;

    const { data, error } = await supabase
      .from('clientes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      throw new AppError('Error updating cliente', 500, 'DB_ERROR');
    }

    const cliente = toApi(data as unknown as ClienteRow);

    if (userId) {
      await auditoriaService.log({
        usuario: 'Admin GoExpress',
        usuarioId: userId,
        accion: 'editar',
        entidad: 'cliente',
        entidadId: id,
        descripcion: `Cliente actualizado: ${cliente.razonSocial}`,
      });
    }

    return cliente;
  }

  async updateEstado(id: string, estado: ClienteEstado, motivo?: string, userId?: string): Promise<Cliente> {
    const existing = await this.getById(id);
    if (existing.eliminado) {
      throw AppError.badRequest('Cannot update estado of a deleted client');
    }

    const { data, error } = await supabase
      .from('clientes')
      .update({ estado })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      throw new AppError('Error updating cliente estado', 500, 'DB_ERROR');
    }

    const cliente = toApi(data as unknown as ClienteRow);

    if (userId) {
      await auditoriaService.log({
        usuario: 'Admin GoExpress',
        usuarioId: userId,
        accion: 'cambio_estado',
        entidad: 'cliente',
        entidadId: id,
        descripcion: `Cliente ${cliente.razonSocial}: estado cambiado a "${estado}"${motivo ? `. Motivo: ${motivo}` : ''}`,
      });
    }

    return cliente;
  }

  async softDelete(id: string, motivo: string, userId: string): Promise<void> {
    const existing = await this.getById(id);
    if (existing.eliminado) {
      throw AppError.badRequest('Client is already deleted');
    }

    const { error } = await supabase
      .from('clientes')
      .update({
        eliminado: true,
        eliminado_por: userId,
        eliminado_en: new Date().toISOString(),
        motivo_eliminacion: motivo,
        estado: 'inactivo',
      })
      .eq('id', id);

    if (error) {
      throw new AppError('Error deleting cliente', 500, 'DB_ERROR');
    }

    await auditoriaService.log({
      usuario: 'Admin GoExpress',
      usuarioId: userId,
      accion: 'eliminar',
      entidad: 'cliente',
      entidadId: id,
      descripcion: `Cliente eliminado: ${existing.razonSocial}. Motivo: ${motivo}`,
    });
  }

  async inviteToPortal(clienteId: string, userId: string): Promise<Cliente> {
    const { data: row, error: fetchErr } = await supabase
      .from('clientes')
      .select(CLIENTE_COLUMNS)
      .eq('id', clienteId)
      .eq('eliminado', false)
      .single();

    if (fetchErr || !row) {
      throw AppError.notFound('Cliente', clienteId);
    }

    const clienteRow = row as unknown as ClienteRow;
    const email = encryptionService.decrypt(clienteRow.email_enc);

    if (!email) {
      throw AppError.badRequest('El cliente no tiene email registrado. No se puede invitar al portal.');
    }

    // Already has active portal access, no need to reinvite
    if (clienteRow.auth_id && clienteRow.portal_status === 'activo') {
      throw AppError.conflict('El cliente ya tiene acceso activo al portal.');
    }

    // Previously invited but not yet active, resend
    if (clienteRow.auth_id) {
      return this.reinviteToPortal(clienteId, userId);
    }

    // Check if a Supabase Auth user already exists with this email
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    let authUserId: string;

    if (existingUser) {
      // User already exists in auth, link them
      authUserId = existingUser.id;
    } else {
      // Invite user via Supabase Auth (sends invite email automatically)
      const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: {
          role: 'cliente',
          cliente_id: clienteId,
          razon_social: clienteRow.razon_social,
        },
        redirectTo: `${process.env['CORS_ORIGINS']?.split(',')[0]?.trim() || 'http://localhost:8080'}/portal/login`,
      });

      if (inviteErr) {
        logger.error({ inviteErr, clienteId, email }, 'Failed to invite client to portal');
        throw new AppError(
          `Error al enviar invitacion: ${inviteErr.message}`,
          500,
          'INVITE_ERROR'
        );
      }

      authUserId = inviteData.user.id;
    }

    // Link auth user to the clientes table
    const { data: updated, error: updateErr } = await supabase
      .from('clientes')
      .update({
        auth_id: authUserId,
        portal_status: 'invitado',
        portal_invited_at: new Date().toISOString(),
      })
      .eq('id', clienteId)
      .select()
      .single();

    if (updateErr || !updated) {
      logger.error({ updateErr, clienteId }, 'Failed to update cliente with auth_id');
      throw new AppError('Error al vincular cuenta de portal', 500, 'DB_ERROR');
    }

    const cliente = toApi(updated as unknown as ClienteRow);

    await auditoriaService.log({
      usuario: 'Admin GoExpress',
      usuarioId: userId,
      accion: 'crear',
      entidad: 'cliente',
      entidadId: clienteId,
      descripcion: `Invitacion al portal enviada a ${email} para ${cliente.razonSocial}`,
    });

    return cliente;
  }

  async reinviteToPortal(clienteId: string, userId: string): Promise<Cliente> {
    const { data: row, error: fetchErr } = await supabase
      .from('clientes')
      .select(CLIENTE_COLUMNS)
      .eq('id', clienteId)
      .eq('eliminado', false)
      .single();

    if (fetchErr || !row) {
      throw AppError.notFound('Cliente', clienteId);
    }

    const clienteRow = row as unknown as ClienteRow;
    const email = encryptionService.decrypt(clienteRow.email_enc);

    if (!clienteRow.auth_id) {
      throw AppError.badRequest('El cliente no ha sido invitado al portal. Use la accion "Invitar" primero.');
    }

    const { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: {
        role: 'cliente',
        cliente_id: clienteId,
        razon_social: clienteRow.razon_social,
      },
      redirectTo: `${process.env['CORS_ORIGINS']?.split(',')[0]?.trim() || 'http://localhost:8080'}/portal/login`,
    });

    if (inviteErr) {
      logger.error({ inviteErr, clienteId, email }, 'Failed to reinvite client');
      throw new AppError(
        `Error al reenviar invitacion: ${inviteErr.message}`,
        500,
        'INVITE_ERROR'
      );
    }

    const { data: updated, error: updateErr } = await supabase
      .from('clientes')
      .update({
        portal_status: 'invitado',
        portal_invited_at: new Date().toISOString(),
      })
      .eq('id', clienteId)
      .select()
      .single();

    if (updateErr || !updated) {
      throw new AppError('Error al actualizar estado de invitacion', 500, 'DB_ERROR');
    }

    const cliente = toApi(updated as unknown as ClienteRow);

    await auditoriaService.log({
      usuario: 'Admin GoExpress',
      usuarioId: userId,
      accion: 'editar',
      entidad: 'cliente',
      entidadId: clienteId,
      descripcion: `Invitacion reenviada a ${email} para ${cliente.razonSocial}`,
    });

    return cliente;
  }

  async resetClientPassword(clienteId: string, userId: string): Promise<{ message: string }> {
    const { data: row, error: fetchErr } = await supabase
      .from('clientes')
      .select(CLIENTE_COLUMNS)
      .eq('id', clienteId)
      .eq('eliminado', false)
      .single();

    if (fetchErr || !row) {
      throw AppError.notFound('Cliente', clienteId);
    }

    const clienteRow = row as unknown as ClienteRow;
    const email = encryptionService.decrypt(clienteRow.email_enc);

    if (!clienteRow.auth_id) {
      throw AppError.badRequest('El cliente no tiene cuenta de portal. Invite primero.');
    }

    const redirectUrl = `${process.env['CORS_ORIGINS']?.split(',')[0]?.trim() || 'http://localhost:8080'}/portal/login`;

    const { data: linkData, error: resetErr } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (resetErr) {
      logger.error({ resetErr, clienteId, email }, 'Failed to generate password reset');
      throw new AppError(
        `Error al generar enlace de recuperacion: ${resetErr.message}`,
        500,
        'RESET_ERROR'
      );
    }

    logger.info({ clienteId, email, linkGenerated: !!linkData }, 'Password reset generated for client');

    await auditoriaService.log({
      usuario: 'Admin GoExpress',
      usuarioId: userId,
      accion: 'editar',
      entidad: 'cliente',
      entidadId: clienteId,
      descripcion: `Reset de password solicitado para ${email}`,
    });

    return { message: `Enlace de recuperacion enviado a ${email}` };
  }

  async activatePortal(clienteId: string): Promise<void> {
    const { error } = await supabase
      .from('clientes')
      .update({
        portal_activo: true,
        portal_status: 'activo',
      })
      .eq('id', clienteId);

    if (error) {
      logger.error({ error, clienteId }, 'Failed to activate client portal');
    }
  }
}

export const clienteService = new ClienteService();
