import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { requireOnlyAdmin } from '../../middleware/adminAuth.js';
import { adminWriteLimiter } from '../../middleware/rateLimit.js';
import { supabase } from '../../config/database.js';
import { auditoriaService } from '../../services/auditoria.service.js';
import { usuarioService } from '../../services/usuario.service.js';
import { sseService } from '../../services/sse.service.js';
import type { UsuarioRow, Usuario } from '../../types/index.js';
import { idParamSchema } from '../../lib/validators/common.schema.js';

const router = Router();


const createUsuarioSchema = z.object({
  nombre: z.string().min(2).max(200),
  email: z.string().trim().toLowerCase().email().max(320),
  rol: z.enum(['admin', 'operador']),
});

const updateUsuarioSchema = z.object({
  nombre: z.string().min(2).max(200).optional(),
  email: z.string().trim().toLowerCase().email().max(320).optional(),
  rol: z.enum(['admin', 'operador']).optional(),
  estado: z.enum(['activo', 'inactivo']).optional(),
});

// Supabase default policy requires at least 6 characters. We require 10 and
// enforce at least one letter and one digit so admin-set credentials survive
// a password audit even if the Supabase project policy later tightens.
const setPasswordSchema = z.object({
  password: z
    .string()
    .min(10, 'La contrasena debe tener al menos 10 caracteres')
    .max(128, 'La contrasena no puede superar 128 caracteres')
    .refine((val) => /[A-Za-z]/.test(val) && /[0-9]/.test(val), {
      message: 'La contrasena debe incluir al menos una letra y un numero',
    }),
});


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

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, auth_id, nombre, email, rol, estado, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      throw new AppError(`Error fetching usuarios: ${error.message}`, 500, 'DB_ERROR');
    }

    res.json(((data ?? []) as UsuarioRow[]).map(toApi));
  })
);

router.post(
  '/',
  validate({ body: createUsuarioSchema }),
  asyncHandler(async (req, res) => {
    const usuario = await usuarioService.createWithInvite(
      req.body,
      req.userId!,
      req.userName ?? 'Admin GoExpress',
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined,
    );

    res.status(201).json(usuario);
  })
);

router.post(
  '/:id/reinvite',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const usuario = await usuarioService.reinvite(
      req.params['id'] as string,
      req.userId!,
      req.userName ?? 'Admin GoExpress',
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined,
    );

    res.json(usuario);
  })
);

router.put(
  '/:id',
  validate({ params: idParamSchema, body: updateUsuarioSchema }),
  asyncHandler(async (req, res) => {
    const id = req.params['id'] as string;

    if (req.body.email !== undefined) {
      const { data: emailConflict } = await supabase
        .from('usuarios')
        .select('id')
        .eq('email', req.body.email)
        .neq('id', id)
        .maybeSingle();

      if (emailConflict) {
        throw AppError.conflict('Ya existe un usuario con ese email');
      }
    }

    const updateData: Record<string, unknown> = {};
    if (req.body.nombre !== undefined) updateData['nombre'] = req.body.nombre;
    if (req.body.email !== undefined) updateData['email'] = req.body.email;
    if (req.body.rol !== undefined) updateData['rol'] = req.body.rol;
    if (req.body.estado !== undefined) updateData['estado'] = req.body.estado;

    const { data, error } = await supabase
      .from('usuarios')
      .update(updateData)
      .eq('id', id)
      .select('id, auth_id, nombre, email, rol, estado, created_at, updated_at')
      .single();

    if (error || !data) {
      throw AppError.notFound('Usuario', id);
    }

    const user = toApi(data as UsuarioRow);

    await auditoriaService.log({
      usuario: req.userName ?? 'Admin GoExpress',
      usuarioId: req.userId!,
      accion: 'editar',
      entidad: 'usuario',
      entidadId: user.id,
      descripcion: `Usuario actualizado: ${user.nombre}`,
      ipAddress: req.ip ?? undefined,
      userAgent: req.headers['user-agent'] ?? undefined,
    });

    res.json(user);
  })
);

router.post(
  '/:id/password',
  requireOnlyAdmin,
  adminWriteLimiter,
  validate({ params: idParamSchema, body: setPasswordSchema }),
  asyncHandler(async (req, res) => {
    const usuario = await usuarioService.setPassword(
      req.params['id'] as string,
      req.body.password,
      req.userId!,
      req.userName ?? 'Admin GoExpress',
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined,
    );

    sseService.broadcast({ entity: ['usuarios'], action: 'password_reset', id: usuario.id });

    res.json(usuario);
  })
);

router.post(
  '/:id/send-password-reset',
  requireOnlyAdmin,
  adminWriteLimiter,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const result = await usuarioService.sendPasswordResetEmail(
      req.params['id'] as string,
      req.userId!,
      req.userName ?? 'Admin GoExpress',
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined,
    );

    res.json({ ok: true, email: result.email });
  })
);

export default router;
