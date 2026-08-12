-- 054: API Gateway Fase 2. Webhooks salientes (outbox + dispatcher in-process), modo test
-- por key (sandbox sin infra duplicada) y fingerprint del body en la idempotencia de envios.
--
-- Webhooks: el tercero registra una URL https y recibe un POST firmado (HMAC-SHA256 con su
-- secreto) cada vez que un envio suyo cambia de estado. El encolado es un INSERT en
-- webhook_deliveries desde el service layer (post-RPC exitoso), NUNCA un trigger de DB
-- haciendo HTTP: la DB no habla con internet. El dispatcher (mismo proceso Railway) toma
-- pendientes vencidas y las entrega con retry + backoff; una delivery ya encolada vive
-- aca y sobrevive restarts (at-least-once). El encolado post-commit es best-effort.
--
-- Idempotente (IF NOT EXISTS / guards). Transaccional. La aplica Gaston a prod con el
-- deploy de Fase 2. NO aplicar a mano fuera de ese deploy.
BEGIN;

-- Entidad nueva en el log forense (mismo mecanismo que 'api_key' en la 053).
ALTER TYPE public.auditoria_entidad ADD VALUE IF NOT EXISTS 'webhook_endpoint';

-- ---------------------------------------------------------------------------
-- api_keys: modo test + permiso 'webhooks'
-- ---------------------------------------------------------------------------

-- Keys de prueba (prefijo ge_test_): validan y cotizan de verdad pero jamas escriben en
-- envios. El sandbox es un modo de la key, no un ambiente duplicado.
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS modo_test boolean NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.api_keys.modo_test IS
  'TRUE = key de sandbox (prefijo ge_test_). POST /api/v1/envios valida y cotiza real pero no inserta; GET devuelve fixtures. El flag de la DB es la fuente de verdad, no el prefijo.';

-- 'webhooks' habilita el self-service de endpoints en /api/v1/webhook-endpoints.
ALTER TABLE public.api_keys DROP CONSTRAINT IF EXISTS api_keys_permisos_validos;
ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_permisos_validos CHECK (
  cardinality(permisos) > 0
  AND permisos <@ ARRAY['crear_envios', 'consultar_envios', 'consultar_tarifas', 'webhooks']::text[]
);

COMMENT ON COLUMN public.api_keys.key_prefix IS
  'Primeros 12 caracteres de la key (ge_live_/ge_test_ + 4). Unico dato mostrable en UI y logs para identificarla.';

-- ---------------------------------------------------------------------------
-- webhook_endpoints
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id  uuid NOT NULL REFERENCES public.clientes(id),
  -- https obligatorio: el payload lleva datos de envios y la firma no protege contra
  -- sniffing. La unica excepcion es loopback http, que existe SOLO para el stack de test
  -- local (el receptor de la suite corre en 127.0.0.1 sin TLS); en runtime el schema Zod
  -- rechaza loopback fuera de NODE_ENV=test, asi que en prod este branch queda inerte.
  url         text NOT NULL CHECK (url ~ '^https://' OR url ~ '^http://127\.0\.0\.1[:/]'),
  -- Secreto HMAC en plaintext, decision deliberada: para FIRMAR cada delivery el backend
  -- necesita el valor original, un hash no sirve (a diferencia de api_keys.key_hash, que
  -- solo compara). El repo removio el cifrado a nivel aplicacion en sql/008 a favor de
  -- encryption-at-rest de Supabase + TLS + acceso solo por service_role; reintroducir una
  -- capa AES con key en env recrearia exactamente lo que esa migracion elimino y sumaria
  -- una dependencia de deploy. Mitigacion: RLS deny total, la columna solo la lee el
  -- dispatcher y el endpoint de prueba, y jamas sale en un response de listado.
  secreto     text NOT NULL CHECK (length(secreto) >= 20),
  eventos     text[] NOT NULL DEFAULT ARRAY['envio.estado_cambiado']::text[],
  activo      boolean NOT NULL DEFAULT TRUE,
  creado_por  uuid NOT NULL REFERENCES public.usuarios(id),
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_at  timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT webhook_endpoints_eventos_validos CHECK (
    cardinality(eventos) > 0
    AND eventos <@ ARRAY['envio.estado_cambiado']::text[]
  )
);

COMMENT ON TABLE public.webhook_endpoints IS
  'Destinos de webhooks salientes del API Gateway v1 (Fase 2). Un endpoint pertenece a UN cliente y recibe solo eventos de sus envios. La baja es logica (activo=FALSE) para conservar el historial de deliveries. El secreto se entrega una sola vez al crear/regenerar.';
COMMENT ON COLUMN public.webhook_endpoints.secreto IS
  'Secreto HMAC-SHA256 (whsec_...). Plaintext por necesidad de firma; ver comentario en la definicion de la tabla. No exponer en listados: solo en el response de crear/regenerar.';

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_cliente ON public.webhook_endpoints (cliente_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_creado_por ON public.webhook_endpoints (creado_por);

DROP TRIGGER IF EXISTS trg_webhook_endpoints_updated_at ON public.webhook_endpoints;
CREATE TRIGGER trg_webhook_endpoints_updated_at
  BEFORE UPDATE ON public.webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY deny_anon ON public.webhook_endpoints TO anon USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

DO $$
BEGIN
  CREATE POLICY deny_authenticated ON public.webhook_endpoints TO authenticated USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- webhook_deliveries (outbox + log de entregas)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  endpoint_id        uuid NOT NULL REFERENCES public.webhook_endpoints(id),
  evento             text NOT NULL,
  payload            jsonb NOT NULL,
  -- Intentos ya ejecutados. El dispatcher incrementa ANTES de hacer el POST (claim
  -- optimista): si el proceso muere a mitad de un intento, el retry queda agendado igual.
  intento            integer NOT NULL DEFAULT 0 CHECK (intento >= 0),
  status             text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'entregado', 'fallido')),
  http_status        integer,
  -- Primeros chars de la respuesta del receptor, para troubleshooting. Truncada en el
  -- service: un body de error de 2MB no tiene nada que hacer en esta tabla.
  respuesta          text,
  proximo_intento_en timestamptz NOT NULL DEFAULT NOW(),
  entregado_en       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.webhook_deliveries IS
  'Outbox y log de webhooks salientes. Una fila por (evento, endpoint). El dispatcher in-process toma status=pendiente con proximo_intento_en vencido, entrega con backoff (1m/5m/25m tras el intento inmediato) y marca entregado o fallido definitivo. Estado 100% en DB: sobrevive restarts.';

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint ON public.webhook_deliveries (endpoint_id);
-- Indice del poll del dispatcher: WHERE status = 'pendiente' AND proximo_intento_en <= NOW().
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pendientes
  ON public.webhook_deliveries (status, proximo_intento_en)
  WHERE status = 'pendiente';

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY deny_anon ON public.webhook_deliveries TO anon USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

DO $$
BEGIN
  CREATE POLICY deny_authenticated ON public.webhook_deliveries TO authenticated USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- envios: fingerprint del body para la idempotencia del gateway
-- ---------------------------------------------------------------------------

-- sha256 hex del body normalizado (post-Zod, keys ordenadas). Cierra el hueco de Fase 1:
-- reusar una Idempotency-Key con un payload DISTINTO devolvia el envio original como si
-- nada; ahora el replay compara el hash y responde 409 IDEMPOTENCY_KEY_REUSED. NULL en
-- envios pre-054 y en los creados por portal/admin.
ALTER TABLE public.envios ADD COLUMN IF NOT EXISTS api_idempotency_body_hash text;

COMMENT ON COLUMN public.envios.api_idempotency_body_hash IS
  'sha256 hex del body normalizado del POST /api/v1/envios que creo el envio. En un replay con la misma Idempotency-Key pero body distinto, el gateway responde 409 en vez de devolver un envio que no corresponde al payload. NULL fuera del gateway.';

COMMIT;
-- ROLLBACK: DROP TABLE public.webhook_deliveries; DROP TABLE public.webhook_endpoints;
-- ALTER TABLE public.envios DROP COLUMN api_idempotency_body_hash;
-- ALTER TABLE public.api_keys DROP COLUMN modo_test;
-- ALTER TABLE public.api_keys DROP CONSTRAINT api_keys_permisos_validos;
-- ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_permisos_validos CHECK (
--   cardinality(permisos) > 0
--   AND permisos <@ ARRAY['crear_envios', 'consultar_envios', 'consultar_tarifas']::text[]
-- );
-- El valor 'webhook_endpoint' de auditoria_entidad no se puede remover (limitacion de
-- Postgres para enums); queda inerte.
