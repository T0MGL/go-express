import { randomBytes } from 'node:crypto';
import { supabase } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { auditoriaService } from './auditoria.service.js';
import { emailService } from './email.service.js';
import { logger } from '../config/logger.js';
import { nowISO } from '../lib/datetime.js';

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  return 'GoExp-' + Array.from(bytes).map(b => chars[b % chars.length]).join('');
}
import type {
  ClienteRow,
  Cliente,
  ClienteEstado,
  PaginatedResponse,
} from '../types/index.js';
import type { CreateClienteInput, UpdateClienteInput, ClienteQuery } from '../lib/validators/cliente.schema.js';
import { escapeLikePattern } from '../lib/validators/common.schema.js';

function toApi(row: ClienteRow): Cliente {
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
    esMostrador: row.es_mostrador,
    eliminado: row.eliminado,
    eliminadoPor: row.eliminado_por,
    eliminadoEn: row.eliminado_en,
    motivoEliminacion: row.motivo_eliminacion,
    creadoEn: row.created_at,
    updatedAt: row.updated_at,
  };
}

const CLIENTE_COLUMNS = [
  'id', 'auth_id', 'razon_social', 'ruc',
  'contacto_nombre', 'contacto_cargo',
  'telefono', 'email', 'direccion',
  'ciudad', 'estado', 'plan',
  'total_envios', 'envios_activos',
  'notas', 'portal_activo', 'portal_status', 'portal_invited_at',
  'es_mostrador',
  'eliminado', 'eliminado_por', 'eliminado_en', 'motivo_eliminacion',
  'created_at', 'updated_at',
].join(', ');

class ClienteService {
  async list(query: ClienteQuery): Promise<PaginatedResponse<Cliente>> {
    const { limit, page = 1, search, estado, plan } = query;
    const offset = (page - 1) * limit;

    let q = supabase
      .from('clientes')
      .select(CLIENTE_COLUMNS, { count: 'exact' })
      .eq('eliminado', false)
      .eq('es_mostrador', false);

    if (estado) q = q.eq('estado', estado);
    if (plan) q = q.eq('plan', plan);
    if (search) {
      const s = escapeLikePattern(search);
      q = q.or(`razon_social.ilike.%${s}%,contacto_nombre.ilike.%${s}%,ruc.ilike.%${s}%,email.ilike.%${s}%`);
    }

    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await q;

    if (error) {
      throw new AppError('Error fetching clientes', 500, 'DB_ERROR');
    }

    return {
      data: ((data ?? []) as unknown as ClienteRow[]).map(toApi),
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

  async exportList(query: ClienteQuery): Promise<Cliente[]> {
    const { search, estado, plan } = query;

    let q = supabase
      .from('clientes')
      .select(CLIENTE_COLUMNS)
      .eq('eliminado', false)
      .eq('es_mostrador', false);

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

  async getMostrador(): Promise<Cliente> {
    const { data, error } = await supabase
      .from('clientes')
      .select(CLIENTE_COLUMNS)
      .eq('es_mostrador', true)
      .eq('eliminado', false)
      .single();

    if (error || !data) {
      throw AppError.notFound('Cliente mostrador no configurado. Aplicar migration 026.');
    }

    return toApi(data as unknown as ClienteRow);
  }

  async create(
    input: CreateClienteInput,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Cliente> {
    const { data: existing } = await supabase
      .from('clientes')
      .select('id')
      .eq('ruc', input.ruc)
      .eq('eliminado', false)
      .maybeSingle();

    if (existing) {
      throw AppError.conflict('A client with this RUC already exists');
    }

    const { data: existingEmail } = await supabase
      .from('clientes')
      .select('id')
      .eq('email', input.email)
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
          ruc: input.ruc,
          contacto_nombre: input.contactoNombre,
          contacto_cargo: input.contactoCargo ?? null,
          telefono: input.telefono,
          email: input.email,
          direccion: input.direccion ?? null,
          ciudad: input.ciudad,
          plan: input.plan,
          notas: input.notas ?? null,
        })
        .select(CLIENTE_COLUMNS)
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
      ipAddress,
      userAgent,
    });

    if (input.email) {
      this.inviteToPortal(cliente.id, userId, ipAddress, userAgent).catch((err) => {
        logger.warn({ err, clienteId: cliente.id }, 'Auto-invite to portal failed (non-blocking)');
      });
    }

    return cliente;
  }

  async update(
    id: string,
    input: UpdateClienteInput,
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Cliente> {
    const existing = await this.getById(id);
    if (existing.eliminado) {
      throw AppError.badRequest('Cannot update a deleted client');
    }

    if (input.email !== undefined && input.email !== existing.email) {
      const { data: emailConflict } = await supabase
        .from('clientes')
        .select('id')
        .eq('email', input.email)
        .eq('eliminado', false)
        .neq('id', id)
        .maybeSingle();

      if (emailConflict) {
        throw AppError.conflict('Ya existe otro cliente con ese email');
      }
    }

    if (input.ruc !== undefined && input.ruc !== existing.ruc) {
      const { data: rucConflict } = await supabase
        .from('clientes')
        .select('id')
        .eq('ruc', input.ruc)
        .eq('eliminado', false)
        .neq('id', id)
        .maybeSingle();

      if (rucConflict) {
        throw AppError.conflict('Ya existe otro cliente con ese RUC');
      }
    }

    const updateData: Record<string, unknown> = {};

    if (input.razonSocial !== undefined) updateData['razon_social'] = input.razonSocial;
    if (input.ruc !== undefined) updateData['ruc'] = input.ruc;
    if (input.contactoNombre !== undefined) updateData['contacto_nombre'] = input.contactoNombre;
    if (input.contactoCargo !== undefined) updateData['contacto_cargo'] = input.contactoCargo;
    if (input.telefono !== undefined) updateData['telefono'] = input.telefono;
    if (input.email !== undefined) updateData['email'] = input.email;
    if (input.direccion !== undefined) updateData['direccion'] = input.direccion ?? null;
    if (input.ciudad !== undefined) updateData['ciudad'] = input.ciudad;
    if (input.plan !== undefined) updateData['plan'] = input.plan;
    if (input.notas !== undefined) updateData['notas'] = input.notas;

    const { data, error } = await supabase
      .from('clientes')
      .update(updateData)
      .eq('id', id)
      .select(CLIENTE_COLUMNS)
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
        ipAddress,
        userAgent,
      });
    }

    return cliente;
  }

  async updateEstado(
    id: string,
    estado: ClienteEstado,
    motivo?: string,
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Cliente> {
    const existing = await this.getById(id);
    if (existing.eliminado) {
      throw AppError.badRequest('Cannot update estado of a deleted client');
    }

    const { data, error } = await supabase
      .from('clientes')
      .update({ estado })
      .eq('id', id)
      .select(CLIENTE_COLUMNS)
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
        ipAddress,
        userAgent,
      });
    }

    return cliente;
  }

  async softDelete(
    id: string,
    motivo: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    const existing = await this.getById(id);
    if (existing.eliminado) {
      throw AppError.badRequest('Client is already deleted');
    }

    const { count: activeEnvios } = await supabase
      .from('envios')
      .select('id', { count: 'exact', head: true })
      .eq('cliente_id', id)
      .eq('eliminado', false)
      .in('estado', ['pendiente', 'recolectado', 'en_transito', 'en_reparto']);

    if (activeEnvios && activeEnvios > 0) {
      throw AppError.conflict(
        `No se puede eliminar el cliente: tiene ${activeEnvios} envio(s) activos. Finalicelos primero.`
      );
    }

    const { error } = await supabase
      .from('clientes')
      .update({
        eliminado: true,
        eliminado_por: userId,
        eliminado_en: nowISO(),
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
      ipAddress,
      userAgent,
    });
  }

  async inviteToPortal(
    clienteId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ cliente: Cliente; tempPassword: string }> {
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
    const email = clienteRow.email;

    if (!email) {
      throw AppError.badRequest('El cliente no tiene email registrado. No se puede invitar al portal.');
    }

    if (clienteRow.auth_id && clienteRow.portal_status === 'activo') {
      throw AppError.conflict('El cliente ya tiene acceso activo al portal.');
    }

    if (clienteRow.auth_id) {
      return this.reinviteToPortal(clienteId, userId, ipAddress, userAgent);
    }

    let authUserId: string;
    const tempPassword = generateTempPassword();

    const { data: createData, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        role: 'cliente',
        cliente_id: clienteId,
        razon_social: clienteRow.razon_social,
      },
    });

    if (createErr) {
      const errMsg = createErr.message?.toLowerCase() ?? '';
      const isExistingUser = errMsg.includes('already') || errMsg.includes('duplicate') || errMsg.includes('exists');

      if (isExistingUser) {
        const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1 });
        const existing = !listErr ? users?.find(u => u.email === email) : null;

        if (existing) {
          authUserId = existing.id;
          await supabase.auth.admin.updateUserById(authUserId, { password: tempPassword });
        } else {
          logger.error({ createErr, clienteId, email }, 'User exists in auth but could not resolve ID');
          throw new AppError('Error al vincular cuenta existente. Contacte soporte.', 500, 'INVITE_ERROR');
        }
      } else {
        logger.error({ createErr, clienteId, email }, 'Failed to create portal user');
        throw new AppError(`Error al crear cuenta de portal: ${createErr.message}`, 500, 'INVITE_ERROR');
      }
    } else {
      authUserId = createData.user.id;
    }

    emailService
      .sendPortalInvite(email, tempPassword, clienteRow.contacto_nombre || clienteRow.razon_social)
      .catch((err) => logger.error({ err, email, clienteId }, 'Failed to send portal invite email'));

    const { data: updated, error: updateErr } = await supabase
      .from('clientes')
      .update({
        auth_id: authUserId,
        portal_status: 'invitado',
        portal_invited_at: nowISO(),
      })
      .eq('id', clienteId)
      .select(CLIENTE_COLUMNS)
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
      ipAddress,
      userAgent,
    });

    return { cliente, tempPassword };
  }

  async reinviteToPortal(
    clienteId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ cliente: Cliente; tempPassword: string }> {
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
    const email = clienteRow.email;

    if (!clienteRow.auth_id) {
      return this.inviteToPortal(clienteId, userId, ipAddress, userAgent);
    }

    const tempPassword = generateTempPassword();

    const { error: updateAuthErr } = await supabase.auth.admin.updateUserById(clienteRow.auth_id, {
      password: tempPassword,
    });

    if (updateAuthErr) {
      logger.error({ updateAuthErr, clienteId, email }, 'Failed to reset portal password');
      throw new AppError(`Error al reenviar invitacion: ${updateAuthErr.message}`, 500, 'INVITE_ERROR');
    }

    emailService
      .sendPortalInvite(email, tempPassword, clienteRow.contacto_nombre || clienteRow.razon_social)
      .catch((err) => logger.error({ err, email, clienteId }, 'Failed to send portal reinvite email'));

    const { data: updated, error: updateErr } = await supabase
      .from('clientes')
      .update({
        portal_status: 'invitado',
        portal_invited_at: nowISO(),
      })
      .eq('id', clienteId)
      .select(CLIENTE_COLUMNS)
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
      ipAddress,
      userAgent,
    });

    return { cliente, tempPassword };
  }

  async resetClientPassword(
    clienteId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ message: string }> {
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
    const email = clienteRow.email;

    if (!clienteRow.auth_id) {
      throw AppError.badRequest('El cliente no tiene cuenta de portal. Invite primero.');
    }

    const redirectUrl = `${env.CORS_ORIGINS.split(',')[0]?.trim() || 'http://localhost:8080'}/portal/login`;

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
      ipAddress,
      userAgent,
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
