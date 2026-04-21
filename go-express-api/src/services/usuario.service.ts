import { randomBytes } from 'node:crypto';
import { supabase } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { auditoriaService } from './auditoria.service.js';
import { emailService } from './email.service.js';
import { logger } from '../config/logger.js';
import type { UsuarioRow, Usuario } from '../types/index.js';

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  return 'GoExp-' + Array.from(bytes).map((b) => chars[b % chars.length]).join('');
}

function toApi(row: UsuarioRow): Usuario {
  return {
    id: row.id,
    authId: row.auth_id,
    nombre: row.nombre,
    email: row.email,
    rol: row.rol,
    estado: row.estado,
    creadoEn: row.created_at,
    updatedAt: row.updated_at,
  };
}

const USUARIO_COLUMNS = 'id, auth_id, nombre, email, rol, estado, created_at, updated_at';

export interface CreateAdminInput {
  nombre: string;
  email: string;
  rol: 'admin' | 'operador';
}

class UsuarioService {
  async createWithInvite(
    input: CreateAdminInput,
    invitedByUserId: string,
    invitedByName: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Usuario> {
    const { nombre, email, rol } = input;

    const { data: existing } = await supabase
      .from('usuarios')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      throw AppError.conflict('Ya existe un usuario con ese email');
    }

    const tempPassword = generateTempPassword();
    let authUserId: string;

    const { data: createData, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { role: rol, nombre },
    });

    if (createErr) {
      const msg = createErr.message?.toLowerCase() ?? '';
      if (msg.includes('already') || msg.includes('duplicate') || msg.includes('exists')) {
        const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 200 });
        const found = !listErr ? listData?.users?.find((u) => u.email === email) : null;
        if (!found) {
          throw new AppError('El email existe en Auth pero no se pudo enlazar', 500, 'INVITE_ERROR');
        }
        authUserId = found.id;
        await supabase.auth.admin.updateUserById(authUserId, { password: tempPassword });
      } else {
        logger.error({ err: createErr, email }, 'Failed to create admin auth user');
        throw new AppError(`Error creando cuenta: ${createErr.message}`, 500, 'INVITE_ERROR');
      }
    } else {
      authUserId = createData.user.id;
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('usuarios')
      .insert({
        auth_id: authUserId,
        nombre,
        email,
        rol,
        estado: 'activo',
      })
      .select(USUARIO_COLUMNS)
      .single();

    if (insertErr || !inserted) {
      logger.error({ err: insertErr, email, authUserId }, 'Failed to insert usuario row after auth create');
      await supabase.auth.admin.deleteUser(authUserId).catch((err) => {
        logger.error({ err, authUserId }, 'Failed to rollback auth user after usuarios insert error');
      });
      throw new AppError(`Error creando usuario: ${insertErr?.message ?? 'insert failed'}`, 500, 'DB_ERROR');
    }

    emailService
      .sendAdminInvite(email, tempPassword, nombre)
      .catch((err) => logger.error({ err, email }, 'Failed to send admin invite email'));

    const usuario = toApi(inserted as UsuarioRow);

    await auditoriaService.log({
      usuario: invitedByName,
      usuarioId: invitedByUserId,
      accion: 'crear',
      entidad: 'usuario',
      entidadId: usuario.id,
      descripcion: `Admin invitado: ${usuario.nombre} (${usuario.rol}) a ${usuario.email}`,
      ipAddress,
      userAgent,
    });

    return usuario;
  }

  async reinvite(
    usuarioId: string,
    invokedByUserId: string,
    invokedByName: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Usuario> {
    const { data: row, error: fetchErr } = await supabase
      .from('usuarios')
      .select(USUARIO_COLUMNS)
      .eq('id', usuarioId)
      .single();

    if (fetchErr || !row) {
      throw AppError.notFound('Usuario', usuarioId);
    }

    const usuarioRow = row as UsuarioRow;
    const tempPassword = generateTempPassword();
    let authUserId = usuarioRow.auth_id;

    if (authUserId) {
      const { error: updateAuthErr } = await supabase.auth.admin.updateUserById(authUserId, {
        password: tempPassword,
      });
      if (updateAuthErr) {
        logger.error({ err: updateAuthErr, usuarioId }, 'Failed to reset admin password');
        throw new AppError('No se pudo restablecer la contraseña', 500, 'INVITE_ERROR');
      }
    } else {
      const { data: createData, error: createErr } = await supabase.auth.admin.createUser({
        email: usuarioRow.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { role: usuarioRow.rol, nombre: usuarioRow.nombre },
      });

      if (createErr) {
        const msg = createErr.message?.toLowerCase() ?? '';
        if (msg.includes('already') || msg.includes('duplicate') || msg.includes('exists')) {
          const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 200 });
          const found = !listErr ? listData?.users?.find((u) => u.email === usuarioRow.email) : null;
          if (!found) {
            throw new AppError('El email existe en Auth pero no se pudo enlazar', 500, 'INVITE_ERROR');
          }
          authUserId = found.id;
          await supabase.auth.admin.updateUserById(authUserId, { password: tempPassword });
        } else {
          logger.error({ err: createErr, usuarioId }, 'Failed to create admin auth user on reinvite');
          throw new AppError(`Error creando cuenta: ${createErr.message}`, 500, 'INVITE_ERROR');
        }
      } else {
        authUserId = createData.user.id;
      }

      const { error: linkErr } = await supabase
        .from('usuarios')
        .update({ auth_id: authUserId })
        .eq('id', usuarioId);

      if (linkErr) {
        logger.error({ err: linkErr, usuarioId, authUserId }, 'Failed to link auth_id to usuario on reinvite');
        throw new AppError('No se pudo vincular la cuenta', 500, 'DB_ERROR');
      }
    }

    emailService
      .sendAdminInvite(usuarioRow.email, tempPassword, usuarioRow.nombre)
      .catch((err) => logger.error({ err, email: usuarioRow.email }, 'Failed to send admin reinvite email'));

    const { data: refreshed } = await supabase
      .from('usuarios')
      .select(USUARIO_COLUMNS)
      .eq('id', usuarioId)
      .single();

    const usuario = toApi((refreshed ?? { ...usuarioRow, auth_id: authUserId }) as UsuarioRow);

    await auditoriaService.log({
      usuario: invokedByName,
      usuarioId: invokedByUserId,
      accion: 'editar',
      entidad: 'usuario',
      entidadId: usuarioId,
      descripcion: `Re-invitacion enviada a ${usuario.email}`,
      ipAddress,
      userAgent,
    });

    return usuario;
  }

  /**
   * Rotates a user's password to an admin-supplied value. Does not email the
   * user. The admin is expected to communicate the new password out of band
   * (in-person, secure channel, password manager share). Requires the target
   * user to have an `auth_id`; otherwise the admin must reinvite first.
   */
  async setPassword(
    usuarioId: string,
    newPassword: string,
    invokedByUserId: string,
    invokedByName: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Usuario> {
    const { data: row, error: fetchErr } = await supabase
      .from('usuarios')
      .select(USUARIO_COLUMNS)
      .eq('id', usuarioId)
      .single();

    if (fetchErr || !row) {
      throw AppError.notFound('Usuario', usuarioId);
    }

    const usuarioRow = row as UsuarioRow;

    if (!usuarioRow.auth_id) {
      throw AppError.badRequest(
        'El usuario no tiene cuenta de autenticacion. Reenvia la invitacion primero.',
      );
    }

    if (usuarioRow.estado !== 'activo') {
      throw AppError.badRequest('El usuario esta inactivo. Reactivalo antes de cambiar la contrasena.');
    }

    const { error: updateErr } = await supabase.auth.admin.updateUserById(usuarioRow.auth_id, {
      password: newPassword,
    });

    if (updateErr) {
      const msg = updateErr.message ?? 'update failed';
      logger.error({ err: updateErr, usuarioId }, 'Failed to set admin user password');
      // Supabase returns a 422 when the password fails server-side policy.
      // Surface it as 400 so the client shows a specific message.
      if (/password/i.test(msg) && /(weak|short|length|policy|requirements)/i.test(msg)) {
        throw AppError.badRequest(msg);
      }
      throw new AppError(`No se pudo cambiar la contrasena: ${msg}`, 500, 'PASSWORD_UPDATE_ERROR');
    }

    await auditoriaService.log({
      usuario: invokedByName,
      usuarioId: invokedByUserId,
      accion: 'editar',
      entidad: 'usuario',
      entidadId: usuarioId,
      descripcion: `Contrasena restablecida por admin para ${usuarioRow.email}`,
      ipAddress,
      userAgent,
    });

    return toApi(usuarioRow);
  }

  /**
   * Generates a Supabase recovery link and emails it through Resend. Lets an
   * admin trigger the same self-service reset flow available on the login
   * page. The target user must have an `auth_id` and be active.
   */
  async sendPasswordResetEmail(
    usuarioId: string,
    invokedByUserId: string,
    invokedByName: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ email: string }> {
    const { data: row, error: fetchErr } = await supabase
      .from('usuarios')
      .select(USUARIO_COLUMNS)
      .eq('id', usuarioId)
      .single();

    if (fetchErr || !row) {
      throw AppError.notFound('Usuario', usuarioId);
    }

    const usuarioRow = row as UsuarioRow;

    if (!usuarioRow.auth_id) {
      throw AppError.badRequest(
        'El usuario no tiene cuenta de autenticacion. Reenvia la invitacion primero.',
      );
    }

    if (usuarioRow.estado !== 'activo') {
      throw AppError.badRequest('El usuario esta inactivo. Reactivalo antes de enviar el reset.');
    }

    const origin = env.CORS_ORIGINS.split(',')[0]?.trim() || 'http://localhost:8080';
    const redirectTo = `${origin}/admin/reset-password`;

    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: usuarioRow.email,
      options: { redirectTo },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      logger.error({ err: linkErr, usuarioId }, 'Failed to generate admin password recovery link');
      throw new AppError('No se pudo generar el enlace de recuperacion', 500, 'RESET_LINK_ERROR');
    }

    emailService
      .sendPasswordReset(usuarioRow.email, usuarioRow.nombre, linkData.properties.action_link, 'admin')
      .catch((err) => logger.error({ err, email: usuarioRow.email }, 'Failed to send admin password reset email'));

    await auditoriaService.log({
      usuario: invokedByName,
      usuarioId: invokedByUserId,
      accion: 'editar',
      entidad: 'usuario',
      entidadId: usuarioId,
      descripcion: `Email de reset enviado a ${usuarioRow.email}`,
      ipAddress,
      userAgent,
    });

    return { email: usuarioRow.email };
  }
}

export const usuarioService = new UsuarioService();
