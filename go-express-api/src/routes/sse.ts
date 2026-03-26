import { Router } from 'express';
import type { Request, Response } from 'express';
import { supabaseAuth, supabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { sseService } from '../services/sse.service.js';

interface AdminRow {
  id: string;
  rol: string;
  estado: string;
}

interface ClienteRow {
  id: string;
  estado: string;
}

const router = Router();

router.get(
  '/',
  async (req: Request, res: Response): Promise<void> => {
    const token = req.query['token'] as string | undefined;

    if (!token) {
      res.status(401).json({ error: 'Token required', code: 'UNAUTHORIZED' });
      return;
    }

    try {
      const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

      if (error || !user) {
        res.status(401).json({ error: 'Invalid or expired token', code: 'UNAUTHORIZED' });
        return;
      }

      // Disable socket inactivity timeout for SSE (long-lived connection)
      req.socket.setTimeout(0);

      const { data: adminUser } = await supabase
        .from('usuarios')
        .select('id, rol, estado')
        .eq('auth_id', user.id)
        .single<AdminRow>();

      if (adminUser) {
        if (adminUser.estado !== 'activo') {
          res.status(403).json({ error: 'Account inactive', code: 'FORBIDDEN' });
          return;
        }

        const role = adminUser.rol === 'admin' ? 'admin' as const : 'operador' as const;
        sseService.addConnection(res, adminUser.id, role, null);

        req.on('close', () => {
          sseService.removeConnection(adminUser.id, res);
        });

        return;
      }

      const { data: clienteUser } = await supabase
        .from('clientes')
        .select('id, estado')
        .eq('auth_id', user.id)
        .eq('eliminado', false)
        .single<ClienteRow>();

      if (clienteUser) {
        if (clienteUser.estado !== 'activo') {
          res.status(403).json({ error: 'Client account inactive', code: 'FORBIDDEN' });
          return;
        }

        sseService.addConnection(res, clienteUser.id, 'cliente', clienteUser.id);

        req.on('close', () => {
          sseService.removeConnection(clienteUser.id, res);
        });

        return;
      }

      res.status(403).json({ error: 'No account linked', code: 'FORBIDDEN' });
    } catch (err) {
      logger.error({ err }, 'SSE auth error');
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal error', code: 'INTERNAL_ERROR' });
      }
    }
  }
);

export default router;
