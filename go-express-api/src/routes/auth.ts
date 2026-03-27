import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { validate } from '../middleware/validate.js';
import { supabase, supabaseAuth } from '../config/database.js';
import { auditoriaService } from '../services/auditoria.service.js';
import { clienteService } from '../services/cliente.service.js';
import { logger } from '../config/logger.js';


const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

/**
 * POST /api/auth/login
 *
 * Authenticates via Supabase Auth signInWithPassword (using the anon-key auth client
 * to avoid polluting the service_role client's auth state), then looks up
 * the user in our usuarios table via the service_role client.
 */
router.post(
  '/login',
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };

    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      logger.warn({ email, error: error?.message }, 'Login attempt failed');
      throw AppError.unauthorized('Credenciales invalidas');
    }

    const { data: dbUser, error: dbError } = await supabase
      .from('usuarios')
      .select('id, nombre, email, rol, estado')
      .eq('auth_id', data.user.id)
      .single();

    if (dbError || !dbUser) {
      logger.warn({ authId: data.user.id, dbError: dbError?.message }, 'Login: user not found in usuarios table');
      throw AppError.unauthorized('Credenciales invalidas');
    }

    const userData = dbUser as { id: string; nombre: string; email: string; rol: string; estado: string };

    if (userData.estado !== 'activo') {
      throw AppError.forbidden('Cuenta inactiva. Contacte al administrador.');
    }

    await auditoriaService.log({
      usuario: userData.nombre,
      usuarioId: userData.id,
      accion: 'login',
      entidad: 'usuario',
      entidadId: userData.id,
      descripcion: `Login exitoso: ${userData.email}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
      user: {
        id: userData.id,
        nombre: userData.nombre,
        email: userData.email,
        rol: userData.rol,
      },
    });
  })
);

/**
 * POST /api/auth/portal/login
 *
 * Client portal login. Authenticates via Supabase Auth, then resolves the client
 * from the clientes table via auth_id. Returns the token and client info.
 */
router.post(
  '/portal/login',
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };

    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      logger.warn({ email, error: error?.message }, 'Portal login attempt failed');
      throw AppError.unauthorized('Credenciales invalidas');
    }

    const { data: clienteRow, error: clienteErr } = await supabase
      .from('clientes')
      .select('id, auth_id, razon_social, estado, portal_activo, portal_status, email, contacto_nombre')
      .eq('auth_id', data.user.id)
      .eq('eliminado', false)
      .single();

    if (clienteErr || !clienteRow) {
      logger.warn({ authId: data.user.id }, 'Portal login: no client linked to this auth user');
      throw AppError.unauthorized('Credenciales invalidas');
    }

    const cliente = clienteRow as {
      id: string;
      auth_id: string;
      razon_social: string;
      estado: string;
      portal_activo: boolean;
      portal_status: string;
      email: string;
      contacto_nombre: string;
    };

    if (cliente.estado !== 'activo') {
      throw AppError.unauthorized('Credenciales invalidas');
    }

    if (!cliente.portal_activo || cliente.portal_status !== 'activo') {
      await clienteService.activatePortal(cliente.id);
    }

    res.json({
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
      cliente: {
        id: cliente.id,
        razonSocial: cliente.razon_social,
        contactoNombre: cliente.contacto_nombre,
        email: cliente.email,
        portalActivo: true,
        portalStatus: 'activo',
      },
    });
  })
);

/**
 * POST /api/auth/refresh
 *
 * Refreshes the Supabase session using the anon-key auth client,
 * then looks up user data via service_role client.
 */
router.post(
  '/refresh',
  validate({ body: refreshSchema }),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body as { refreshToken: string };

    const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data.session) {
      throw AppError.unauthorized('Token de refresco invalido o expirado');
    }

    const { data: dbUser } = await supabase
      .from('usuarios')
      .select('id, nombre, email, rol, estado')
      .eq('auth_id', data.user?.id)
      .single();

    const userData = dbUser as { id: string; nombre: string; email: string; rol: string; estado: string } | null;

    if (userData) {
      if (userData.estado !== 'activo') {
        throw AppError.forbidden('Cuenta inactiva. Contacte al administrador.');
      }

      res.json({
        token: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
        user: {
          id: userData.id,
          nombre: userData.nombre,
          email: userData.email,
          rol: userData.rol,
        },
      });
      return;
    }

    const { data: clienteRow } = await supabase
      .from('clientes')
      .select('id, razon_social, email, contacto_nombre, estado')
      .eq('auth_id', data.user?.id)
      .eq('eliminado', false)
      .single();

    if (clienteRow) {
      const cr = clienteRow as { id: string; razon_social: string; email: string; contacto_nombre: string; estado: string };

      if (cr.estado !== 'activo') {
        throw AppError.forbidden('Su cuenta esta inactiva o suspendida. Contacte a GO EXPRESS.');
      }

      res.json({
        token: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
        cliente: {
          id: cr.id,
          razonSocial: cr.razon_social,
          contactoNombre: cr.contacto_nombre,
          email: cr.email,
        },
      });
      return;
    }

    throw AppError.forbidden('No account linked to this user');
  })
);

/**
 * POST /api/auth/logout
 *
 * Signs out the user from Supabase Auth.
 */
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const { data: { user } } = await supabaseAuth.auth.getUser(token);
      if (user) {
        const { data: dbUser } = await supabase
          .from('usuarios')
          .select('id, nombre')
          .eq('auth_id', user.id)
          .single();

        if (dbUser) {
          const userData = dbUser as { id: string; nombre: string };
          await auditoriaService.log({
            usuario: userData.nombre,
            usuarioId: userData.id,
            accion: 'logout',
            entidad: 'usuario',
            entidadId: userData.id,
            descripcion: `Logout: ${user.email}`,
          });
        }

        await supabase.auth.admin.signOut(user.id, 'global');
      }
    }

    res.status(204).send();
  })
);

/**
 * GET /api/auth/me
 *
 * Returns the current authenticated user's profile.
 * Works for both admin users and client portal users.
 */
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw AppError.unauthorized('Missing authorization header');
    }

    const token = authHeader.slice(7);
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

    if (error || !user) {
      throw AppError.unauthorized('Invalid or expired token');
    }

    const { data: dbUser, error: dbError } = await supabase
      .from('usuarios')
      .select('id, nombre, email, rol, estado')
      .eq('auth_id', user.id)
      .single();

    if (!dbError && dbUser) {
      const userData = dbUser as { id: string; nombre: string; email: string; rol: string; estado: string };

      if (userData.estado !== 'activo') {
        throw AppError.forbidden('Cuenta inactiva. Contacte al administrador.');
      }

      res.json({
        id: userData.id,
        nombre: userData.nombre,
        email: userData.email,
        rol: userData.rol,
        estado: userData.estado,
        tipo: 'admin',
      });
      return;
    }

    const { data: clienteRow } = await supabase
      .from('clientes')
      .select('id, razon_social, email, contacto_nombre, estado, portal_activo, portal_status')
      .eq('auth_id', user.id)
      .eq('eliminado', false)
      .single();

    if (clienteRow) {
      const cr = clienteRow as {
        id: string;
        razon_social: string;
        email: string;
        contacto_nombre: string;
        estado: string;
        portal_activo: boolean;
        portal_status: string;
      };

      if (cr.estado !== 'activo') {
        throw AppError.forbidden('Su cuenta esta inactiva o suspendida. Contacte a GO EXPRESS.');
      }

      res.json({
        id: cr.id,
        nombre: cr.contacto_nombre,
        email: cr.email,
        razonSocial: cr.razon_social,
        rol: 'cliente',
        estado: cr.estado,
        portalActivo: cr.portal_activo,
        portalStatus: cr.portal_status,
        tipo: 'cliente',
      });
      return;
    }

    throw AppError.notFound('User profile not found');
  })
);

export default router;
