import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { validate } from '../middleware/validate.js';
import { supabase, supabaseAuth } from '../config/database.js';
import { auditoriaService } from '../services/auditoria.service.js';
import { clienteService } from '../services/cliente.service.js';
import { repartidorService } from '../services/repartidor.service.js';
import { emailService } from '../services/email.service.js';
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
 * POST /api/auth/repartidor/login
 *
 * Repartidor portal login. Authenticates via Supabase Auth, then resolves the
 * repartidor from the repartidores table via auth_id.
 */
router.post(
  '/repartidor/login',
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };

    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      logger.warn({ email, error: error?.message }, 'Repartidor login attempt failed');
      throw AppError.unauthorized('Credenciales invalidas');
    }

    const { data: repartidorRow, error: repartidorErr } = await supabase
      .from('repartidores')
      .select('id, auth_id, nombre, estado, portal_status, email, vehiculo')
      .eq('auth_id', data.user.id)
      .eq('eliminado', false)
      .single();

    if (repartidorErr || !repartidorRow) {
      logger.warn({ authId: data.user.id }, 'Repartidor login: no repartidor linked');
      throw AppError.unauthorized('Credenciales invalidas');
    }

    const rep = repartidorRow as {
      id: string;
      auth_id: string;
      nombre: string;
      estado: string;
      portal_status: string;
      email: string | null;
      vehiculo: string;
    };

    if (rep.estado !== 'activo') {
      throw AppError.unauthorized('Cuenta de repartidor inactiva');
    }

    if (rep.portal_status !== 'activo') {
      await repartidorService.activatePortal(rep.id);
    }

    res.json({
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
      repartidor: {
        id: rep.id,
        nombre: rep.nombre,
        email: rep.email,
        vehiculo: rep.vehiculo,
      },
    });
  }),
);

const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  portal: z.enum(['cliente', 'repartidor', 'admin']),
  redirectTo: z.string().url(),
});

/**
 * POST /api/auth/forgot-password
 *
 * Generates a password recovery link via Supabase admin API and sends it
 * through Resend using our own branded template. Always returns 200 to
 * avoid email enumeration attacks.
 */
router.post(
  '/forgot-password',
  validate({ body: forgotPasswordSchema }),
  asyncHandler(async (req, res) => {
    const { email, portal, redirectTo } = req.body as z.infer<typeof forgotPasswordSchema>;

    let account: (Record<string, unknown> & { email?: string; estado?: string }) | null = null;
    let accountName = '';

    if (portal === 'admin') {
      const { data: row } = await supabase
        .from('usuarios')
        .select('id, email, estado, nombre')
        .ilike('email', email)
        .maybeSingle();

      const usuarioRow = row as { id: string; email: string; estado: string; nombre: string } | null;
      if (usuarioRow) {
        account = usuarioRow as unknown as typeof account;
        accountName = usuarioRow.nombre;
      }
    } else {
      const table = portal === 'repartidor' ? 'repartidores' : 'clientes';
      const nameField = portal === 'repartidor' ? 'nombre' : 'contacto_nombre';

      const { data: row } = await supabase
        .from(table)
        .select(`id, email, estado, eliminado, ${nameField}`)
        .ilike('email', email)
        .eq('eliminado', false)
        .maybeSingle();

      const portalRow = row as (Record<string, unknown> & { email?: string; estado?: string }) | null;
      if (portalRow) {
        account = portalRow;
        accountName = typeof portalRow[nameField] === 'string' ? (portalRow[nameField] as string) : '';
      }
    }

    if (!account || account.estado !== 'activo') {
      logger.info({ email, portal }, 'Forgot-password request for unknown or inactive account');
      res.json({ ok: true });
      return;
    }

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    });

    if (linkError || !linkData?.properties?.action_link) {
      logger.error({ err: linkError, email, portal }, 'Failed to generate recovery link');
      res.json({ ok: true });
      return;
    }

    emailService
      .sendPasswordReset(email, accountName, linkData.properties.action_link, portal)
      .catch((err) => logger.error({ err, email }, 'Failed to send password reset email'));

    res.json({ ok: true });
  }),
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

    const { data: repartidorRow } = await supabase
      .from('repartidores')
      .select('id, nombre, email, estado, vehiculo')
      .eq('auth_id', data.user?.id)
      .eq('eliminado', false)
      .single();

    if (repartidorRow) {
      const rp = repartidorRow as { id: string; nombre: string; email: string | null; estado: string; vehiculo: string };

      if (rp.estado !== 'activo') {
        throw AppError.forbidden('Cuenta de repartidor inactiva.');
      }

      res.json({
        token: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
        repartidor: {
          id: rp.id,
          nombre: rp.nombre,
          email: rp.email,
          vehiculo: rp.vehiculo,
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
            ipAddress: req.ip ?? undefined,
            userAgent: req.headers['user-agent'] ?? undefined,
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

    const { data: repRow } = await supabase
      .from('repartidores')
      .select('id, nombre, email, estado, vehiculo')
      .eq('auth_id', user.id)
      .eq('eliminado', false)
      .single();

    if (repRow) {
      const rp = repRow as { id: string; nombre: string; email: string | null; estado: string; vehiculo: string };

      if (rp.estado !== 'activo') {
        throw AppError.forbidden('Cuenta de repartidor inactiva. Contacte a GO EXPRESS.');
      }

      res.json({
        id: rp.id,
        nombre: rp.nombre,
        email: rp.email ?? '',
        rol: 'repartidor',
        estado: rp.estado,
        vehiculo: rp.vehiculo,
        tipo: 'repartidor',
      });
      return;
    }

    throw AppError.notFound('User profile not found');
  })
);

export default router;
