import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { supabase } from '../../config/database.js';
import { auditoriaService } from '../../services/auditoria.service.js';
import type { UsuarioRow, Usuario } from '../../types/index.js';
import { idParamSchema } from '../../lib/validators/common.schema.js';

const router = Router();


const createUsuarioSchema = z.object({
  nombre: z.string().min(2).max(200),
  email: z.string().email().max(320),
  rol: z.enum(['admin', 'operador']),
});

const updateUsuarioSchema = z.object({
  nombre: z.string().min(2).max(200).optional(),
  email: z.string().email().max(320).optional(),
  rol: z.enum(['admin', 'operador']).optional(),
  estado: z.enum(['activo', 'inactivo']).optional(),
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

/**
 * GET /:List users
 */
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

/**
 * POST /:Create user
 */
router.post(
  '/',
  validate({ body: createUsuarioSchema }),
  asyncHandler(async (req, res) => {
    const { data: existingUser } = await supabase
      .from('usuarios')
      .select('id')
      .eq('email', req.body.email)
      .maybeSingle();

    if (existingUser) {
      throw AppError.conflict('Ya existe un usuario con ese email');
    }

    const { data, error } = await supabase
      .from('usuarios')
      .insert({
        auth_id: null,  // Will be linked to Supabase Auth later
        nombre: req.body.nombre,
        email: req.body.email,
        rol: req.body.rol,
      })
      .select('id, auth_id, nombre, email, rol, estado, created_at, updated_at')
      .single();

    if (error || !data) {
      throw new AppError(`Error creating usuario: ${error?.message}`, 500, 'DB_ERROR');
    }

    const user = toApi(data as UsuarioRow);

    await auditoriaService.log({
      usuario: req.userName ?? 'Admin GoExpress',
      usuarioId: req.userId!,
      accion: 'crear',
      entidad: 'usuario',
      entidadId: user.id,
      descripcion: `Usuario creado: ${user.nombre} (${user.rol})`,
    });

    res.status(201).json(user);
  })
);

/**
 * PUT /:id:Update user
 */
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
    });

    res.json(user);
  })
);

export default router;
