-- 028_tarifas_ciudades_fk.sql
-- Agrega FK origen_ciudad_id / destino_ciudad_id a tarifas. Las columnas
-- origen/destino (text) se mantienen por 1 sprint para retrocompatibilidad,
-- despues se dropean en una migration posterior.
--
-- Backfill: match por nombre normalizado (lowercase + unaccent basico) contra
-- el catalogo seedeado en 027. Si alguna tarifa activa no matchea, el raise
-- aborta la migration para forzar fixup manual.

-- 1) Helper de normalizacion dentro de la migration
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION pg_temp.norm_ciudad(s TEXT)
RETURNS TEXT AS $$
  SELECT lower(unaccent(regexp_replace(trim(s), '\s+', ' ', 'g')))
$$ LANGUAGE sql IMMUTABLE;

-- 2) Nuevas columnas nullable (para poder backfillear)
ALTER TABLE tarifas
  ADD COLUMN IF NOT EXISTS origen_ciudad_id UUID REFERENCES ciudades(id) ON DELETE RESTRICT;
ALTER TABLE tarifas
  ADD COLUMN IF NOT EXISTS destino_ciudad_id UUID REFERENCES ciudades(id) ON DELETE RESTRICT;

-- 3) Backfill desde origen/destino text por nombre normalizado
UPDATE tarifas t
SET origen_ciudad_id = c.id
FROM ciudades c
WHERE t.origen_ciudad_id IS NULL
  AND pg_temp.norm_ciudad(c.nombre) = pg_temp.norm_ciudad(t.origen);

UPDATE tarifas t
SET destino_ciudad_id = c.id
FROM ciudades c
WHERE t.destino_ciudad_id IS NULL
  AND pg_temp.norm_ciudad(c.nombre) = pg_temp.norm_ciudad(t.destino);

-- 4) Validar que no quedo ninguna tarifa activa sin match. Si quedo, abortar.
DO $$
DECLARE
  huerfanas INTEGER;
  detalle TEXT;
BEGIN
  SELECT COUNT(*) INTO huerfanas
  FROM tarifas
  WHERE eliminado = FALSE
    AND (origen_ciudad_id IS NULL OR destino_ciudad_id IS NULL);

  IF huerfanas > 0 THEN
    SELECT string_agg(
      format('id=%s origen=%L destino=%L', id, origen, destino),
      '; '
    ) INTO detalle
    FROM tarifas
    WHERE eliminado = FALSE
      AND (origen_ciudad_id IS NULL OR destino_ciudad_id IS NULL);

    RAISE EXCEPTION
      'Backfill incompleto: % tarifas activas sin match en catalogo de ciudades. Detalle: %',
      huerfanas, detalle;
  END IF;
END $$;

-- 5) Las eliminadas que no matcheen quedan con NULL. No bloquea. Se limpian on demand.
--    No hacemos NOT NULL todavia porque los deletes historicos podrian apuntar a ciudades inexistentes.

-- 6) Indices para el cotizador y el panel de cobertura
CREATE INDEX IF NOT EXISTS idx_tarifas_origen_ciudad ON tarifas(origen_ciudad_id) WHERE eliminado = FALSE;
CREATE INDEX IF NOT EXISTS idx_tarifas_destino_ciudad ON tarifas(destino_ciudad_id) WHERE eliminado = FALSE;
CREATE INDEX IF NOT EXISTS idx_tarifas_cotizador
  ON tarifas(origen_ciudad_id, destino_ciudad_id, tipo_servicio)
  WHERE eliminado = FALSE AND activo = TRUE;

COMMENT ON COLUMN tarifas.origen_ciudad_id IS 'FK al catalogo de ciudades. Reemplaza la columna origen (text) que queda para retrocompatibilidad 1 sprint.';
COMMENT ON COLUMN tarifas.destino_ciudad_id IS 'FK al catalogo de ciudades. Reemplaza la columna destino (text) que queda para retrocompatibilidad 1 sprint.';
