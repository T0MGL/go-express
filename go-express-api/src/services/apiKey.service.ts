import { supabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import { auditoriaService } from './auditoria.service.js';
import { generateApiKey, hashApiKey, apiKeyPrefix } from '../lib/apiKey.js';
import { nowISO } from '../lib/datetime.js';
import type { ApiKey, ApiKeyRow } from '../types/index.js';
import type { CreateApiKeyInput } from '../lib/validators/api-key.schema.js';

// key_hash JAMAS entra en este select: no sale del backend ni para el panel admin.
const API_KEY_COLUMNS =
  'id, cliente_id, nombre, key_prefix, permisos, modo_test, activo, revocada_en, expira_en, last_used_at, created_at';

interface ActorContext {
  userId: string;
  userName: string;
  ipAddress?: string;
  userAgent?: string;
}

type ApiKeyListRow = Omit<ApiKeyRow, 'key_hash' | 'revocada_por' | 'creado_por' | 'updated_at'> & {
  clientes?: { razon_social: string } | null;
};

function mapApiKeyRow(row: ApiKeyListRow): ApiKey {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    clienteNombre: row.clientes?.razon_social ?? null,
    nombre: row.nombre,
    keyPrefix: row.key_prefix,
    permisos: row.permisos,
    modoTest: row.modo_test,
    activo: row.activo,
    revocadaEn: row.revocada_en,
    expiraEn: row.expira_en,
    lastUsedAt: row.last_used_at,
    creadoEn: row.created_at,
  };
}

class ApiKeyService {
  /**
   * Crea una key para un cliente activo. Devuelve el plaintext UNA sola vez:
   * a la DB va solo el sha256 y el prefijo visible.
   */
  async create(input: CreateApiKeyInput, actor: ActorContext): Promise<{ apiKey: ApiKey; key: string }> {
    const { data: clienteData, error: clienteError } = await supabase
      .from('clientes')
      .select('razon_social, estado')
      .eq('id', input.clienteId)
      .eq('eliminado', false)
      .single();

    if (clienteError || !clienteData) {
      throw AppError.notFound('Cliente', input.clienteId);
    }

    const cliente = clienteData as { razon_social: string; estado: string };
    if (cliente.estado !== 'activo') {
      throw AppError.badRequest('No se pueden emitir API keys para clientes inactivos o suspendidos');
    }

    const key = generateApiKey(input.modoTest);

    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        cliente_id: input.clienteId,
        nombre: input.nombre,
        key_hash: hashApiKey(key),
        key_prefix: apiKeyPrefix(key),
        permisos: input.permisos,
        modo_test: input.modoTest,
        activo: true,
        expira_en: input.expiraEn ?? null,
        creado_por: actor.userId,
      })
      .select(API_KEY_COLUMNS)
      .single();

    if (error || !data) {
      logger.error({ error, clienteId: input.clienteId }, 'Error creando API key');
      throw new AppError('Error creando API key', 500, 'DB_ERROR');
    }

    const apiKey = mapApiKeyRow(data as unknown as ApiKeyListRow);
    apiKey.clienteNombre = cliente.razon_social;

    await auditoriaService.log({
      usuario: actor.userName,
      usuarioId: actor.userId,
      accion: 'crear',
      entidad: 'api_key',
      entidadId: apiKey.id,
      descripcion: `API key "${input.nombre}" (${apiKey.keyPrefix})${input.modoTest ? ' [modo test]' : ''} creada para ${cliente.razon_social}. Permisos: ${input.permisos.join(', ')}`,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return { apiKey, key };
  }

  async list(clienteId?: string): Promise<ApiKey[]> {
    let q = supabase
      .from('api_keys')
      .select(`${API_KEY_COLUMNS}, clientes(razon_social)`)
      .order('created_at', { ascending: false });

    if (clienteId) q = q.eq('cliente_id', clienteId);

    const { data, error } = await q;

    if (error) {
      logger.error({ error }, 'Error listando API keys');
      throw new AppError('Error listando API keys', 500, 'DB_ERROR');
    }

    return ((data ?? []) as unknown as ApiKeyListRow[]).map(mapApiKeyRow);
  }

  /**
   * Revocacion definitiva e inmediata. A diferencia de la rotacion, no hay ventana:
   * la key muere en el proximo request.
   */
  async revocar(id: string, actor: ActorContext): Promise<ApiKey> {
    const existing = await this.getActiva(id);

    const { data, error } = await supabase
      .from('api_keys')
      .update({
        activo: false,
        revocada_en: nowISO(),
        revocada_por: actor.userId,
      })
      .eq('id', id)
      .select(API_KEY_COLUMNS)
      .single();

    if (error || !data) {
      logger.error({ error, apiKeyId: id }, 'Error revocando API key');
      throw new AppError('Error revocando API key', 500, 'DB_ERROR');
    }

    await auditoriaService.log({
      usuario: actor.userName,
      usuarioId: actor.userId,
      accion: 'anular',
      entidad: 'api_key',
      entidadId: id,
      descripcion: `API key "${existing.nombre}" (${existing.key_prefix}) revocada`,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return mapApiKeyRow(data as unknown as ApiKeyListRow);
  }

  /**
   * Rotacion sin corte: emite una key nueva con el mismo cliente/nombre/permisos y deja
   * la vieja con expira_en = ahora + ventana. Son dos escrituras sin transaccion (PostgREST
   * no las soporta y un RPC es overkill para credenciales, no mueve plata): si la segunda
   * falla, se elimina la key recien creada (nunca fue entregada) y el caller reintenta.
   */
  async rotar(
    id: string,
    ventanaHoras: number,
    actor: ActorContext
  ): Promise<{ apiKey: ApiKey; key: string; keyAnteriorExpiraEn: string }> {
    const existing = await this.getActiva(id);

    // La sucesora hereda el modo: rotar una key de test jamas emite una live.
    const key = generateApiKey(existing.modo_test);

    const { data: nuevaData, error: insertError } = await supabase
      .from('api_keys')
      .insert({
        cliente_id: existing.cliente_id,
        nombre: existing.nombre,
        key_hash: hashApiKey(key),
        key_prefix: apiKeyPrefix(key),
        permisos: existing.permisos,
        modo_test: existing.modo_test,
        activo: true,
        creado_por: actor.userId,
      })
      .select(API_KEY_COLUMNS)
      .single();

    if (insertError || !nuevaData) {
      logger.error({ error: insertError, apiKeyId: id }, 'Error creando la key sucesora en rotacion');
      throw new AppError('Error rotando API key', 500, 'DB_ERROR');
    }

    const nueva = mapApiKeyRow(nuevaData as unknown as ApiKeyListRow);

    const expiraEn = new Date(Date.now() + ventanaHoras * 60 * 60 * 1000).toISOString();

    const { error: updateError } = await supabase
      .from('api_keys')
      .update({ expira_en: expiraEn })
      .eq('id', id);

    if (updateError) {
      // Compensacion: sin la expiracion de la vieja no hay rotacion valida. La sucesora
      // nunca salio del proceso, borrarla es seguro.
      await supabase.from('api_keys').delete().eq('id', nueva.id);
      logger.error({ error: updateError, apiKeyId: id }, 'Error expirando la key vieja en rotacion');
      throw new AppError('Error rotando API key', 500, 'DB_ERROR');
    }

    await auditoriaService.log({
      usuario: actor.userName,
      usuarioId: actor.userId,
      accion: 'editar',
      entidad: 'api_key',
      entidadId: id,
      descripcion: `API key "${existing.nombre}" (${existing.key_prefix}) rotada: sucesora ${nueva.keyPrefix}, la anterior expira ${expiraEn} (ventana ${ventanaHoras}h)`,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return { apiKey: nueva, key, keyAnteriorExpiraEn: expiraEn };
  }

  private async getActiva(id: string): Promise<Pick<ApiKeyRow, 'id' | 'cliente_id' | 'nombre' | 'key_prefix' | 'permisos' | 'modo_test' | 'activo'>> {
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, cliente_id, nombre, key_prefix, permisos, modo_test, activo')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      logger.error({ error, apiKeyId: id }, 'Error buscando API key');
      throw new AppError('Error buscando API key', 500, 'DB_ERROR');
    }

    if (!data) {
      throw AppError.notFound('API key', id);
    }

    const row = data as unknown as Pick<ApiKeyRow, 'id' | 'cliente_id' | 'nombre' | 'key_prefix' | 'permisos' | 'modo_test' | 'activo'>;

    if (!row.activo) {
      throw AppError.badRequest('La API key ya esta revocada');
    }

    return row;
  }
}

export const apiKeyService = new ApiKeyService();
