-- 011_seguro_config.sql
-- Seguro de envio: config admin-configurable + snapshot columns en envios

-- 1) Seed default seguro config (JSONB object en tabla configuracion existente)
--    umbralIncluido: valor declarado por debajo del cual el seguro esta incluido (Gs)
--    tasaAdicional:  fraccion del valor declarado que se cobra como seguro adicional (0.01 = 1%)
--    minimoAdicional: monto minimo que se cobra cuando se aplica seguro adicional (Gs)
--    maximoAsegurable: techo sobre el valor declarado asegurable. Por encima, requiere revision manual (Gs)
INSERT INTO configuracion (key, value) VALUES
  ('seguro_config', '{"umbralIncluido":200000,"tasaAdicional":0.01,"minimoAdicional":5000,"maximoAsegurable":50000000}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2) Snapshot del seguro en cada envio. Inmutable una vez creado.
--    Permite que cambios en la politica de seguro no afecten envios historicos (integridad contable).
ALTER TABLE envios ADD COLUMN IF NOT EXISTS seguro_adicional BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE envios ADD COLUMN IF NOT EXISTS costo_seguro INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN envios.seguro_adicional IS 'True si el cliente agrego seguro adicional al envio. False si solo tiene la cobertura incluida por default.';
COMMENT ON COLUMN envios.costo_seguro IS 'Monto cobrado por el seguro adicional (Gs). Snapshot inmutable calculado al momento de crear el envio.';
