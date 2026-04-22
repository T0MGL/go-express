-- 026_cliente_mostrador.sql
-- Soporte para envios de mostrador (walk-in): mercaderia entregada al despacho
-- sin que el remitente sea un cliente registrado. Se implementa con un cliente
-- sentinela unico (es_mostrador = true) al que apuntan todos los envios walk-in.
-- El nombre real del remitente se pasa en createEnvioSchema.clienteNombreOverride
-- y el service reemplaza cliente_nombre solo cuando es_mostrador es true.

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS es_mostrador BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN clientes.es_mostrador IS
  'Cliente sentinela para envios walk-in. Solo un row deberia tener TRUE. Permite override de cliente_nombre por envio.';

-- Solo puede existir un cliente mostrador activo a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_mostrador_unico
  ON clientes(es_mostrador)
  WHERE es_mostrador = TRUE AND eliminado = FALSE;

-- Seed del cliente mostrador. Datos sentinela: RUC y email no colisionan con
-- clientes reales. Idempotente via ON CONFLICT sobre el indice unico de RUC.
INSERT INTO clientes (
  razon_social,
  ruc,
  contacto_nombre,
  telefono,
  email,
  ciudad,
  estado,
  plan,
  es_mostrador,
  notas
) VALUES (
  'Mostrador',
  'MOSTRADOR-SIN-RUC',
  'Cliente sin cuenta',
  '+595000000000',
  'mostrador@goexpress.local',
  'Asunción',
  'activo',
  'basico',
  TRUE,
  'Cliente sentinela para envios walk-in. No editar ni eliminar.'
)
ON CONFLICT DO NOTHING;
