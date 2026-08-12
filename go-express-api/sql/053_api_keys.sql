-- 053: API Gateway Fase 1. Terceros (ERPs, tiendas, integradores) necesitan crear y consultar
-- envios sin credenciales del portal. Cada cliente recibe API keys propias con permisos
-- granulares. La key NUNCA se persiste en plaintext: se guarda sha256 hex (lookup O(1) por
-- indice unico) y un prefijo visible de 12 chars para identificarla en UI y logs. La rotacion
-- no corta al tercero: la key vieja queda con expira_en = ahora + ventana y muere sola.
--
-- Idempotente (IF NOT EXISTS / guards). Transaccional. La aplica Gaston a prod con el deploy
-- de Fase 1.
BEGIN;

-- Entidad nueva en el log forense. ADD VALUE es permitido dentro de transaccion desde PG12
-- mientras el valor no se use en la misma transaccion (aca no se usa).
ALTER TYPE public.auditoria_entidad ADD VALUE IF NOT EXISTS 'api_key';

CREATE TABLE IF NOT EXISTS public.api_keys (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id         uuid NOT NULL REFERENCES public.clientes(id),
  -- Label operativo ("ERP Tienda X", "Integracion Shopify"), no es secreto.
  nombre             text NOT NULL,
  -- sha256 hex de la key completa. El plaintext se muestra UNA vez al crear y no se guarda.
  key_hash           text NOT NULL,
  -- Primeros 12 chars de la key ('ge_live_' + 4) para identificacion en UI/logs sin exponerla.
  key_prefix         text NOT NULL,
  permisos           text[] NOT NULL,
  activo             boolean NOT NULL DEFAULT TRUE,
  revocada_en        timestamptz,
  revocada_por       uuid REFERENCES public.usuarios(id),
  -- Ventana de rotacion: la key vieja sigue valida hasta esta fecha para que el tercero
  -- haga el switch sin corte de servicio. NULL = no expira.
  expira_en          timestamptz,
  last_used_at       timestamptz,
  creado_por         uuid NOT NULL REFERENCES public.usuarios(id),
  created_at         timestamptz NOT NULL DEFAULT NOW(),
  updated_at         timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT api_keys_key_hash_unique UNIQUE (key_hash),
  CONSTRAINT api_keys_permisos_validos CHECK (
    cardinality(permisos) > 0
    AND permisos <@ ARRAY['crear_envios', 'consultar_envios', 'consultar_tarifas']::text[]
  ),
  CONSTRAINT api_keys_nombre_no_vacio CHECK (length(trim(nombre)) >= 3)
);

COMMENT ON TABLE public.api_keys IS
  'Credenciales del API Gateway v1 (Fase 1). Una key pertenece a UN cliente y solo opera sobre sus envios. key_hash es sha256 hex del plaintext (que se entrega una sola vez al crear); el middleware valida activo + no revocada + no expirada y anota last_used_at. Revocar es definitivo (activo=FALSE); rotar crea una key nueva y deja la vieja con expira_en = ahora + ventana.';
COMMENT ON COLUMN public.api_keys.key_hash IS
  'sha256 hex de la key completa. Nunca plaintext. El lookup del middleware es por igualdad sobre el indice unico.';
COMMENT ON COLUMN public.api_keys.key_prefix IS
  'Primeros 12 caracteres de la key (ge_live_ + 4). Unico dato mostrable en UI y logs para identificarla.';
COMMENT ON COLUMN public.api_keys.expira_en IS
  'Fin de la ventana de rotacion. La key sigue operativa hasta esta fecha aunque exista una sucesora. NULL = sin expiracion.';

-- FKs indexados explicitamente (Postgres no lo hace solo). key_hash ya queda indexado por
-- el UNIQUE.
CREATE INDEX IF NOT EXISTS idx_api_keys_cliente ON public.api_keys (cliente_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_creado_por ON public.api_keys (creado_por);
CREATE INDEX IF NOT EXISTS idx_api_keys_revocada_por ON public.api_keys (revocada_por)
  WHERE revocada_por IS NOT NULL;

DROP TRIGGER IF EXISTS trg_api_keys_updated_at ON public.api_keys;
CREATE TRIGGER trg_api_keys_updated_at
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS defensa en profundidad, mismo patron que el resto del schema: el backend entra con
-- service_role (bypassa RLS); anon y authenticated no tienen nada que hacer en esta tabla.
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY deny_anon ON public.api_keys TO anon USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

DO $$
BEGIN
  CREATE POLICY deny_authenticated ON public.api_keys TO authenticated USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

-- Idempotencia del POST /api/v1/envios: el retry de red de un ERP integrado no puede
-- duplicar envios (doble tracking, doble factura, doble notificacion). El tercero manda
-- el header Idempotency-Key y el unique parcial por cliente convierte el duplicado en un
-- replay del envio original. NULL para todo el resto de los paths (portal, admin, bulk).
ALTER TABLE public.envios ADD COLUMN IF NOT EXISTS api_idempotency_key text;

COMMENT ON COLUMN public.envios.api_idempotency_key IS
  'Idempotency-Key del POST /api/v1/envios, unica por cliente. Un retry con la misma key devuelve el envio original en vez de crear otro. NULL en envios creados por portal/admin.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_envios_api_idempotency
  ON public.envios (cliente_id, api_idempotency_key)
  WHERE api_idempotency_key IS NOT NULL;

COMMIT;
-- ROLLBACK: DROP TABLE public.api_keys; (indices, trigger y policies caen con la tabla).
-- DROP INDEX public.idx_envios_api_idempotency; ALTER TABLE public.envios DROP COLUMN api_idempotency_key;
-- El valor 'api_key' de auditoria_entidad no se puede remover (limitacion de Postgres para
-- valores de enum); queda inerte sin la tabla y no afecta al resto del log.
