import { supabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import { auditoriaService } from './auditoria.service.js';
import { generateWebhookSecret } from '../lib/apiKey.js';
import type { WebhookEndpoint, WebhookEndpointRow } from '../types/index.js';
import type { UpdateWebhookEndpointInput } from '../lib/validators/webhook.schema.js';

// El secreto JAMAS entra en este select: solo lo leen el dispatcher y el endpoint de
// prueba, por columna explicita, y solo viaja al caller en el response de crear/regenerar.
const ENDPOINT_COLUMNS = 'id, cliente_id, url, eventos, activo, created_at';

// Tope de endpoints activos por cliente: acota el fan-out por cambio de estado (cada
// endpoint es un POST saliente con retries) y evita que una integracion rota registre
// destinos sin limite.
const MAX_ENDPOINTS_ACTIVOS = 5;

interface ActorContext {
  userId: string;
  userName: string;
  ipAddress?: string;
  userAgent?: string;
}

type EndpointListRow = Pick<WebhookEndpointRow, 'id' | 'cliente_id' | 'url' | 'eventos' | 'activo' | 'created_at'>;

function mapEndpointRow(row: EndpointListRow): WebhookEndpoint {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    url: row.url,
    eventos: row.eventos,
    activo: row.activo,
    creadoEn: row.created_at,
  };
}

class WebhookEndpointService {
  async list(clienteId?: string): Promise<WebhookEndpoint[]> {
    let q = supabase
      .from('webhook_endpoints')
      .select(ENDPOINT_COLUMNS)
      .order('created_at', { ascending: false });

    if (clienteId) q = q.eq('cliente_id', clienteId);

    const { data, error } = await q;

    if (error) {
      logger.error({ error, clienteId }, 'Error listando webhook endpoints');
      throw new AppError('Error listando webhook endpoints', 500, 'DB_ERROR');
    }

    return ((data ?? []) as unknown as EndpointListRow[]).map(mapEndpointRow);
  }

  /**
   * Registra un endpoint y devuelve el secreto UNA sola vez. El caller (admin o tercero
   * via v1) verifica el permiso; aca se valida cliente activo y el tope de endpoints.
   */
  async create(
    input: { clienteId: string; url: string; eventos: string[] },
    actor: ActorContext
  ): Promise<{ endpoint: WebhookEndpoint; secreto: string }> {
    const [clienteResult, activosResult] = await Promise.all([
      supabase
        .from('clientes')
        .select('razon_social, estado')
        .eq('id', input.clienteId)
        .eq('eliminado', false)
        .single(),
      supabase
        .from('webhook_endpoints')
        .select('id', { count: 'exact', head: true })
        .eq('cliente_id', input.clienteId)
        .eq('activo', true),
    ]);

    if (clienteResult.error || !clienteResult.data) {
      throw AppError.notFound('Cliente', input.clienteId);
    }
    const cliente = clienteResult.data as { razon_social: string; estado: string };
    if (cliente.estado !== 'activo') {
      throw AppError.badRequest('No se pueden registrar webhooks para clientes inactivos o suspendidos');
    }

    if ((activosResult.count ?? 0) >= MAX_ENDPOINTS_ACTIVOS) {
      throw AppError.badRequest(
        `Limite de ${MAX_ENDPOINTS_ACTIVOS} webhook endpoints activos por cliente alcanzado. Elimina uno antes de registrar otro.`
      );
    }

    const secreto = generateWebhookSecret();

    const { data, error } = await supabase
      .from('webhook_endpoints')
      .insert({
        cliente_id: input.clienteId,
        url: input.url,
        secreto,
        eventos: input.eventos,
        activo: true,
        creado_por: actor.userId,
      })
      .select(ENDPOINT_COLUMNS)
      .single();

    if (error || !data) {
      logger.error({ error, clienteId: input.clienteId }, 'Error creando webhook endpoint');
      throw new AppError('Error creando webhook endpoint', 500, 'DB_ERROR');
    }

    const endpoint = mapEndpointRow(data as unknown as EndpointListRow);

    await auditoriaService.log({
      usuario: actor.userName,
      usuarioId: actor.userId,
      accion: 'crear',
      entidad: 'webhook_endpoint',
      entidadId: endpoint.id,
      descripcion: `Webhook endpoint ${endpoint.url} registrado para ${cliente.razon_social}. Eventos: ${input.eventos.join(', ')}`,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return { endpoint, secreto };
  }

  /** Update parcial (admin): url, eventos o activo. */
  async update(id: string, input: UpdateWebhookEndpointInput, actor: ActorContext): Promise<WebhookEndpoint> {
    const existing = await this.getById(id);

    const updateData: Record<string, unknown> = {};
    if (input.url !== undefined) updateData['url'] = input.url;
    if (input.eventos !== undefined) updateData['eventos'] = input.eventos;
    if (input.activo !== undefined) updateData['activo'] = input.activo;

    const { data, error } = await supabase
      .from('webhook_endpoints')
      .update(updateData)
      .eq('id', id)
      .select(ENDPOINT_COLUMNS)
      .single();

    if (error || !data) {
      logger.error({ error, endpointId: id }, 'Error actualizando webhook endpoint');
      throw new AppError('Error actualizando webhook endpoint', 500, 'DB_ERROR');
    }

    await auditoriaService.log({
      usuario: actor.userName,
      usuarioId: actor.userId,
      accion: 'editar',
      entidad: 'webhook_endpoint',
      entidadId: id,
      descripcion: `Webhook endpoint ${existing.url} actualizado: ${Object.keys(updateData).join(', ')}`,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return mapEndpointRow(data as unknown as EndpointListRow);
  }

  /**
   * Baja logica (activo=FALSE), no DELETE fisico: el historial de deliveries referencia
   * el endpoint y es parte del log operativo. clienteId acota el scope cuando la baja
   * viene del self-service v1 (un tercero no puede tocar endpoints ajenos).
   */
  async deactivate(id: string, actor: ActorContext, clienteId?: string): Promise<void> {
    const existing = await this.getById(id, clienteId);

    if (!existing.activo) {
      throw AppError.badRequest('El webhook endpoint ya esta desactivado');
    }

    const { error } = await supabase
      .from('webhook_endpoints')
      .update({ activo: false })
      .eq('id', id);

    if (error) {
      logger.error({ error, endpointId: id }, 'Error desactivando webhook endpoint');
      throw new AppError('Error desactivando webhook endpoint', 500, 'DB_ERROR');
    }

    await auditoriaService.log({
      usuario: actor.userName,
      usuarioId: actor.userId,
      accion: 'anular',
      entidad: 'webhook_endpoint',
      entidadId: id,
      descripcion: `Webhook endpoint ${existing.url} desactivado`,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
  }

  /**
   * Regenera el secreto (admin). Corta las firmas viejas en el acto: el tercero tiene que
   * actualizar su verificacion con el valor nuevo, que se muestra una sola vez.
   */
  async regenerateSecret(id: string, actor: ActorContext): Promise<{ endpoint: WebhookEndpoint; secreto: string }> {
    const existing = await this.getById(id);

    if (!existing.activo) {
      throw AppError.badRequest('No se puede regenerar el secreto de un endpoint desactivado');
    }

    const secreto = generateWebhookSecret();

    const { data, error } = await supabase
      .from('webhook_endpoints')
      .update({ secreto })
      .eq('id', id)
      .select(ENDPOINT_COLUMNS)
      .single();

    if (error || !data) {
      logger.error({ error, endpointId: id }, 'Error regenerando secreto de webhook endpoint');
      throw new AppError('Error regenerando secreto', 500, 'DB_ERROR');
    }

    await auditoriaService.log({
      usuario: actor.userName,
      usuarioId: actor.userId,
      accion: 'editar',
      entidad: 'webhook_endpoint',
      entidadId: id,
      descripcion: `Secreto del webhook endpoint ${existing.url} regenerado`,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return { endpoint: mapEndpointRow(data as unknown as EndpointListRow), secreto };
  }

  private async getById(id: string, clienteId?: string): Promise<WebhookEndpoint> {
    let q = supabase.from('webhook_endpoints').select(ENDPOINT_COLUMNS).eq('id', id);
    if (clienteId) q = q.eq('cliente_id', clienteId);

    const { data, error } = await q.maybeSingle();

    if (error) {
      logger.error({ error, endpointId: id }, 'Error buscando webhook endpoint');
      throw new AppError('Error buscando webhook endpoint', 500, 'DB_ERROR');
    }

    // Con scope de cliente, un endpoint ajeno responde el mismo 404 que uno inexistente.
    if (!data) {
      throw AppError.notFound('Webhook endpoint', id);
    }

    return mapEndpointRow(data as unknown as EndpointListRow);
  }
}

export const webhookEndpointService = new WebhookEndpointService();
