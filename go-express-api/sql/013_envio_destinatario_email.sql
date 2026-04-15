-- Store destinatario email so the person receiving the package can be
-- notified on every state change. The empresa cliente never gets state-
-- change emails (would be spam); the empresa only receives confirmation
-- when the envio reaches "entregado". See email.service.ts.

ALTER TABLE envios
  ADD COLUMN IF NOT EXISTS destinatario_email VARCHAR(320);

COMMENT ON COLUMN envios.destinatario_email IS
  'Optional email of the end recipient. When present, we notify them on envio created, state changes, delivered, and problems. Independent from clientes.email (which is the empresa contact).';

CREATE INDEX IF NOT EXISTS idx_envios_destinatario_email
  ON envios(destinatario_email)
  WHERE eliminado = FALSE AND destinatario_email IS NOT NULL;
