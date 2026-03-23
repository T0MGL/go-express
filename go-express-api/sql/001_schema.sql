-- ═══════════════════════════════════════════════════════════════
-- GO EXPRESS — Database Schema v1.1
-- Execute this in Supabase Dashboard > SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ═══════════════════════════════════════════════════════════════
-- ENUM TYPES
-- ═══════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'operador');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('activo', 'inactivo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cliente_estado AS ENUM ('activo', 'inactivo', 'suspendido');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cliente_plan AS ENUM ('basico', 'profesional', 'enterprise');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE envio_estado AS ENUM (
    'pendiente', 'recolectado', 'en_transito',
    'en_reparto', 'entregado', 'fallido', 'problema'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tipo_pago AS ENUM ('anticipado', 'contra_entrega', 'cuenta_corriente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE metodo_pago AS ENUM ('efectivo', 'transferencia', 'tarjeta', 'contra_entrega');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_pago AS ENUM ('pendiente', 'pagado', 'pago_parcial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tipo_servicio AS ENUM ('estandar', 'express', 'economico');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE vehiculo_tipo AS ENUM ('Moto', 'Auto', 'Camioneta');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE repartidor_estado AS ENUM ('activo', 'inactivo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_almacen AS ENUM (
    'recibido', 'en_almacen', 'listo_despacho', 'despachado', 'devuelto'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE prioridad_tipo AS ENUM ('normal', 'alta', 'urgente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE movimiento_tipo AS ENUM ('entrada', 'salida', 'movimiento_interno', 'devolucion');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE auditoria_accion AS ENUM (
    'crear', 'editar', 'eliminar', 'exportar',
    'cambio_estado', 'pago', 'nota', 'asignar', 'importar', 'login'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE auditoria_entidad AS ENUM (
    'envio', 'cliente', 'repartidor', 'pago',
    'nota_interna', 'tarifa', 'usuario', 'almacen', 'sistema'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════════
-- USUARIOS DEL SISTEMA (Operadores GoExpress)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID UNIQUE,
  nombre VARCHAR(200) NOT NULL,
  email VARCHAR(320) NOT NULL UNIQUE,
  rol user_role NOT NULL DEFAULT 'operador',
  estado user_status NOT NULL DEFAULT 'activo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- CLIENTES (Empresas que contratan GoExpress)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID UNIQUE,
  razon_social VARCHAR(300) NOT NULL,
  ruc_enc TEXT NOT NULL,
  ruc_hash VARCHAR(64) NOT NULL,
  contacto_nombre_enc TEXT NOT NULL,
  contacto_cargo VARCHAR(100),
  telefono_enc TEXT NOT NULL,
  email_enc TEXT NOT NULL,
  email_hash VARCHAR(64) NOT NULL,
  direccion_enc TEXT,                                   -- Fix #6: nullable (service allows null)
  ciudad VARCHAR(100),                                  -- Fix #6: nullable (service allows null)
  estado cliente_estado NOT NULL DEFAULT 'activo',
  plan cliente_plan NOT NULL DEFAULT 'basico',
  saldo_cuenta_corriente BIGINT NOT NULL DEFAULT 0,
  total_envios INT NOT NULL DEFAULT 0,
  envios_activos INT NOT NULL DEFAULT 0,
  notas TEXT,
  eliminado BOOLEAN NOT NULL DEFAULT FALSE,
  eliminado_por UUID REFERENCES usuarios(id),
  eliminado_en TIMESTAMPTZ,
  motivo_eliminacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_estado ON clientes(estado) WHERE eliminado = FALSE;
CREATE INDEX IF NOT EXISTS idx_clientes_razon_social ON clientes USING gin(razon_social gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clientes_ruc_hash ON clientes(ruc_hash);
CREATE INDEX IF NOT EXISTS idx_clientes_email_hash ON clientes(email_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_ruc_unique ON clientes(ruc_hash) WHERE eliminado = FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_email_unique ON clientes(email_hash) WHERE eliminado = FALSE;
CREATE INDEX IF NOT EXISTS idx_clientes_created_at ON clientes(created_at DESC) WHERE eliminado = FALSE;  -- Fix #9: missing index

-- ═══════════════════════════════════════════════════════════════
-- REPARTIDORES
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS repartidores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR(200) NOT NULL,
  telefono_enc TEXT NOT NULL,
  vehiculo vehiculo_tipo NOT NULL,
  placa VARCHAR(20) NOT NULL,
  licencia VARCHAR(50),
  estado repartidor_estado NOT NULL DEFAULT 'activo',
  eliminado BOOLEAN NOT NULL DEFAULT FALSE,
  eliminado_por UUID REFERENCES usuarios(id),
  eliminado_en TIMESTAMPTZ,
  motivo_eliminacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repartidores_estado ON repartidores(estado) WHERE eliminado = FALSE;

-- ═══════════════════════════════════════════════════════════════
-- TARIFAS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tarifas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  origen VARCHAR(100) NOT NULL,
  destino VARCHAR(100) NOT NULL,
  tipo_servicio tipo_servicio NOT NULL,
  precio_base BIGINT NOT NULL CHECK (precio_base > 0),                          -- Fix #8: CHECK constraint
  peso_base DECIMAL(6,2) NOT NULL,
  precio_por_kg_extra BIGINT NOT NULL DEFAULT 0 CHECK (precio_por_kg_extra >= 0), -- Fix #8: CHECK + DEFAULT
  factor_dimensional INT NOT NULL DEFAULT 5000,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_por UUID NOT NULL REFERENCES usuarios(id),
  eliminado BOOLEAN NOT NULL DEFAULT FALSE,
  eliminado_por UUID REFERENCES usuarios(id),
  eliminado_en TIMESTAMPTZ,
  motivo_eliminacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tarifas_ruta ON tarifas(origen, destino) WHERE eliminado = FALSE AND activo = TRUE;

-- ═══════════════════════════════════════════════════════════════
-- ENVÍOS (tabla principal)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS envios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tracking_number VARCHAR(20) NOT NULL UNIQUE,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,           -- Fix #13: explicit RESTRICT
  cliente_nombre VARCHAR(300) NOT NULL,
  codigo_referencia VARCHAR(100),
  origen VARCHAR(100) NOT NULL,
  destino VARCHAR(100) NOT NULL,
  destinatario_nombre_enc TEXT NOT NULL,
  destinatario_direccion_enc TEXT NOT NULL,
  destinatario_telefono_enc TEXT NOT NULL,
  destinatario_telefono2_enc TEXT,
  destinatario_cedula_enc TEXT,
  destinatario_ciudad VARCHAR(100) NOT NULL,
  destinatario_departamento VARCHAR(100) NOT NULL DEFAULT '',
  destinatario_barrio VARCHAR(100),
  destinatario_referencia_enc TEXT,
  destinatario_ubicacion_url TEXT,
  destinatario_nombre_search VARCHAR(300) NOT NULL,                              -- Fix #6: NOT NULL (service always populates)
  destinatario_telefono_hash VARCHAR(64) NOT NULL,                               -- Fix #6: NOT NULL (service always populates)
  cantidad INT NOT NULL DEFAULT 1,
  producto VARCHAR(500) NOT NULL DEFAULT '',
  peso DECIMAL(8,2) NOT NULL CHECK (peso >= 0),                                  -- Fix #8 + #15: CHECK >= 0 (allow 0 for cotización)
  dimensiones_largo DECIMAL(6,1),
  dimensiones_ancho DECIMAL(6,1),
  dimensiones_alto DECIMAL(6,1),
  fragil BOOLEAN NOT NULL DEFAULT FALSE,
  valor_declarado BIGINT NOT NULL DEFAULT 0 CHECK (valor_declarado >= 0),        -- Fix #8: CHECK constraint
  instrucciones_entrega TEXT,
  horario_entrega VARCHAR(100),
  notas TEXT,
  estado envio_estado NOT NULL DEFAULT 'pendiente',
  costo BIGINT NOT NULL DEFAULT 0 CHECK (costo >= 0),                            -- Fix #8: CHECK + DEFAULT
  monto_a_cobrar BIGINT NOT NULL DEFAULT 0 CHECK (monto_a_cobrar >= 0),          -- Fix #8: CHECK constraint
  tipo_pago tipo_pago NOT NULL DEFAULT 'anticipado',
  repartidor_id UUID REFERENCES repartidores(id) ON DELETE SET NULL,             -- Fix #13: explicit SET NULL
  repartidor_asignado_en TIMESTAMPTZ,
  problema_descripcion TEXT,
  problema_fecha TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  tarifa_id UUID REFERENCES tarifas(id) ON DELETE RESTRICT,                      -- Fix #13: explicit RESTRICT
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Soft delete
  eliminado BOOLEAN NOT NULL DEFAULT FALSE,
  eliminado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,                 -- Fix #13: explicit SET NULL
  eliminado_en TIMESTAMPTZ,
  motivo_eliminacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fix #10: Removed redundant idx_envios_tracking (UNIQUE constraint creates implicit index)
CREATE INDEX IF NOT EXISTS idx_envios_cliente ON envios(cliente_id);
CREATE INDEX IF NOT EXISTS idx_envios_estado ON envios(estado);
CREATE INDEX IF NOT EXISTS idx_envios_fecha ON envios(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_envios_repartidor ON envios(repartidor_id) WHERE repartidor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_envios_cliente_estado ON envios(cliente_id, estado);
CREATE INDEX IF NOT EXISTS idx_envios_nombre_search ON envios USING gin(destinatario_nombre_search gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_envios_tags ON envios USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_envios_telefono_hash ON envios(destinatario_telefono_hash);
CREATE INDEX IF NOT EXISTS idx_envios_not_deleted ON envios(id) WHERE eliminado = FALSE;
CREATE INDEX IF NOT EXISTS idx_envios_created_at ON envios(created_at DESC);     -- Fix #9: missing index

-- Secuencia para tracking numbers
CREATE SEQUENCE IF NOT EXISTS tracking_seq START 1000 INCREMENT 1;

-- ═══════════════════════════════════════════════════════════════
-- EVENTOS DE ENVÍO (Timeline de tracking)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS eventos_envio (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  envio_id UUID NOT NULL REFERENCES envios(id) ON DELETE CASCADE,
  estado envio_estado NOT NULL,                                                  -- Fix #5: VARCHAR(50) → envio_estado ENUM
  descripcion TEXT NOT NULL,
  ubicacion VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eventos_envio ON eventos_envio(envio_id, created_at);

-- ═══════════════════════════════════════════════════════════════
-- PAGOS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pagos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  envio_id UUID NOT NULL REFERENCES envios(id) ON DELETE CASCADE,
  monto_total BIGINT NOT NULL CHECK (monto_total > 0),                           -- Fix #8: CHECK constraint
  monto_recibido BIGINT NOT NULL DEFAULT 0 CHECK (monto_recibido >= 0),          -- Fix #8: CHECK constraint
  metodo_pago metodo_pago NOT NULL,
  estado_pago estado_pago NOT NULL DEFAULT 'pendiente',
  fecha_pago DATE,
  referencia_enc TEXT,
  notas TEXT,
  creado_por UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagos_envio ON pagos(envio_id);
CREATE INDEX IF NOT EXISTS idx_pagos_estado ON pagos(estado_pago);
CREATE INDEX IF NOT EXISTS idx_pagos_created_at ON pagos(created_at DESC);       -- Fix #9: missing index

-- ═══════════════════════════════════════════════════════════════
-- NOTAS INTERNAS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notas_internas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  envio_id UUID NOT NULL REFERENCES envios(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  usuario VARCHAR(200) NOT NULL,
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notas_envio ON notas_internas(envio_id, created_at);

-- ═══════════════════════════════════════════════════════════════
-- ALMACÉN / WAREHOUSE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS inventario_almacen (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  envio_id UUID REFERENCES envios(id),
  tracking_number VARCHAR(20) NOT NULL,
  cliente_nombre VARCHAR(300) NOT NULL,
  ubicacion VARCHAR(200) NOT NULL,
  zona VARCHAR(10) NOT NULL,
  estante VARCHAR(10),
  estado_almacen estado_almacen NOT NULL DEFAULT 'recibido',
  fecha_ingreso TIMESTAMPTZ DEFAULT NOW(),                                       -- Fix #14: DATE → TIMESTAMPTZ
  fecha_salida TIMESTAMPTZ,                                                      -- Fix #14: DATE → TIMESTAMPTZ
  peso DECIMAL(8,2) NOT NULL,
  dimensiones_largo DECIMAL(6,1),
  dimensiones_ancho DECIMAL(6,1),
  dimensiones_alto DECIMAL(6,1),
  volumen DECIMAL(10,2),
  notas TEXT,
  prioridad prioridad_tipo NOT NULL DEFAULT 'normal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventario_estado ON inventario_almacen(estado_almacen);
CREATE INDEX IF NOT EXISTS idx_inventario_tracking ON inventario_almacen(tracking_number);

CREATE TABLE IF NOT EXISTS movimientos_almacen (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paquete_id UUID NOT NULL REFERENCES inventario_almacen(id) ON DELETE CASCADE,
  tracking_number VARCHAR(20) NOT NULL,
  tipo movimiento_tipo NOT NULL,
  ubicacion_origen VARCHAR(200),
  ubicacion_destino VARCHAR(200),
  usuario VARCHAR(200) NOT NULL,
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movimientos_paquete ON movimientos_almacen(paquete_id);

CREATE TABLE IF NOT EXISTS picking_items (                                       -- Fix #2: picking_list → picking_items
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  envio_id UUID NOT NULL REFERENCES envios(id) ON DELETE CASCADE,
  tracking_number VARCHAR(20) NOT NULL,
  cliente_nombre VARCHAR(300) NOT NULL,
  ubicacion VARCHAR(200) NOT NULL,
  destino VARCHAR(100) NOT NULL,
  peso DECIMAL(8,2) NOT NULL,
  prioridad prioridad_tipo NOT NULL DEFAULT 'normal',
  pickeado BOOLEAN NOT NULL DEFAULT FALSE,
  empaquetado BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_picking_empaquetado ON picking_items(empaquetado) WHERE empaquetado = FALSE;  -- Fix #9: missing index

-- ═══════════════════════════════════════════════════════════════
-- PRODUCTOS GUARDADOS (Catálogo del cliente)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS productos_guardados (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nombre VARCHAR(300) NOT NULL,
  descripcion TEXT,
  peso DECIMAL(8,2) NOT NULL,
  dimensiones_largo DECIMAL(6,1),                                                -- Fix #6: nullable (removed NOT NULL)
  dimensiones_ancho DECIMAL(6,1),                                                -- Fix #6: nullable (removed NOT NULL)
  dimensiones_alto DECIMAL(6,1),                                                 -- Fix #6: nullable (removed NOT NULL)
  fragil BOOLEAN NOT NULL DEFAULT FALSE,
  valor_declarado BIGINT DEFAULT 0,                                              -- Fix #6: added DEFAULT 0
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_productos_cliente ON productos_guardados(cliente_id);

-- ═══════════════════════════════════════════════════════════════
-- TAGS / ETIQUETAS (por cliente)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,
  color VARCHAR(30) DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cliente_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_tags_cliente ON tags(cliente_id);

-- ═══════════════════════════════════════════════════════════════
-- AUDITORÍA (Inmutable — solo INSERT, nunca UPDATE/DELETE)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS auditoria_log (                                       -- Fix #1: auditoria_logs → auditoria_log
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario VARCHAR(200) NOT NULL,
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  accion auditoria_accion NOT NULL,
  entidad auditoria_entidad NOT NULL,
  entidad_id VARCHAR(100) NOT NULL,
  descripcion TEXT NOT NULL,
  valor_anterior JSONB,                                                          -- Fix #7: TEXT → JSONB
  valor_nuevo JSONB,                                                             -- Fix #7: TEXT → JSONB
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria_log(created_at DESC);    -- Fix #1: updated reference
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria_log(usuario_id);       -- Fix #1: updated reference
CREATE INDEX IF NOT EXISTS idx_auditoria_entidad ON auditoria_log(entidad, entidad_id); -- Fix #1: updated reference
CREATE INDEX IF NOT EXISTS idx_auditoria_accion ON auditoria_log(accion);            -- Fix #1: updated reference

-- ═══════════════════════════════════════════════════════════════
-- CONFIGURACIÓN DEL SISTEMA
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS configuracion (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES usuarios(id)
);

-- ═══════════════════════════════════════════════════════════════
-- FUNCIONES Y TRIGGERS
-- ═══════════════════════════════════════════════════════════════

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
DROP TRIGGER IF EXISTS trg_usuarios_updated_at ON usuarios;
CREATE TRIGGER trg_usuarios_updated_at BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_clientes_updated_at ON clientes;
CREATE TRIGGER trg_clientes_updated_at BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_envios_updated_at ON envios;
CREATE TRIGGER trg_envios_updated_at BEFORE UPDATE ON envios FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_repartidores_updated_at ON repartidores;
CREATE TRIGGER trg_repartidores_updated_at BEFORE UPDATE ON repartidores FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_tarifas_updated_at ON tarifas;
CREATE TRIGGER trg_tarifas_updated_at BEFORE UPDATE ON tarifas FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_pagos_updated_at ON pagos;
CREATE TRIGGER trg_pagos_updated_at BEFORE UPDATE ON pagos FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_inventario_updated_at ON inventario_almacen;
CREATE TRIGGER trg_inventario_updated_at BEFORE UPDATE ON inventario_almacen FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_picking_updated_at ON picking_items;                  -- Fix #2: picking_list → picking_items
CREATE TRIGGER trg_picking_updated_at BEFORE UPDATE ON picking_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_productos_updated_at ON productos_guardados;
CREATE TRIGGER trg_productos_updated_at BEFORE UPDATE ON productos_guardados FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Fix #11: Add updated_at trigger on configuracion table
DROP TRIGGER IF EXISTS trg_configuracion_updated_at ON configuracion;
CREATE TRIGGER trg_configuracion_updated_at BEFORE UPDATE ON configuracion FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Update client envio counters
CREATE OR REPLACE FUNCTION update_cliente_envio_counts()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE clientes SET
    total_envios = (SELECT COUNT(*) FROM envios WHERE cliente_id = COALESCE(NEW.cliente_id, OLD.cliente_id)),
    envios_activos = (SELECT COUNT(*) FROM envios WHERE cliente_id = COALESCE(NEW.cliente_id, OLD.cliente_id) AND estado IN ('pendiente', 'recolectado', 'en_transito', 'en_reparto'))
  WHERE id = COALESCE(NEW.cliente_id, OLD.cliente_id);
  -- Fix #3: Handle DELETE (NEW is null on DELETE)
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_envios_count ON envios;
CREATE TRIGGER trg_envios_count
AFTER INSERT OR UPDATE OF estado OR DELETE ON envios
FOR EACH ROW EXECUTE FUNCTION update_cliente_envio_counts();

-- Generate tracking number
CREATE OR REPLACE FUNCTION generate_tracking_number()
RETURNS TEXT AS $$
DECLARE
  prefix TEXT;
  year_val TEXT;
  seq_val BIGINT;
BEGIN
  SELECT value::text INTO prefix FROM configuracion WHERE key = 'tracking_prefix';
  SELECT value::text INTO year_val FROM configuracion WHERE key = 'tracking_year';
  prefix := REPLACE(prefix, '"', '');
  year_val := REPLACE(year_val, '"', '');
  seq_val := nextval('tracking_seq');
  RETURN prefix || year_val || LPAD(seq_val::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- Fix #4: Lock down to service_role only (deny anon + authenticated)
-- service_role bypasses RLS, so no explicit allow policy needed for it
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE envios ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos_envio ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_internas ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos_guardados ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_log ENABLE ROW LEVEL SECURITY;                             -- Fix #1: updated reference
ALTER TABLE repartidores ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarifas ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_almacen ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_almacen ENABLE ROW LEVEL SECURITY;
ALTER TABLE picking_items ENABLE ROW LEVEL SECURITY;                             -- Fix #2: updated reference
ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;

-- Fix #4: Restrictive policies — deny anon and authenticated for every table
-- service_role bypasses RLS entirely, so only it can access data

DROP POLICY IF EXISTS "service_role_all" ON usuarios;
CREATE POLICY "deny_anon" ON usuarios FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated" ON usuarios FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "service_role_all" ON clientes;
CREATE POLICY "deny_anon" ON clientes FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated" ON clientes FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "service_role_all" ON envios;
CREATE POLICY "deny_anon" ON envios FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated" ON envios FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "service_role_all" ON eventos_envio;
CREATE POLICY "deny_anon" ON eventos_envio FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated" ON eventos_envio FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "service_role_all" ON pagos;
CREATE POLICY "deny_anon" ON pagos FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated" ON pagos FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "service_role_all" ON notas_internas;
CREATE POLICY "deny_anon" ON notas_internas FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated" ON notas_internas FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "service_role_all" ON productos_guardados;
CREATE POLICY "deny_anon" ON productos_guardados FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated" ON productos_guardados FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "service_role_all" ON tags;
CREATE POLICY "deny_anon" ON tags FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated" ON tags FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "service_role_all" ON auditoria_log;                       -- Fix #1: updated reference
CREATE POLICY "deny_anon" ON auditoria_log FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated" ON auditoria_log FOR ALL TO authenticated USING (false) WITH CHECK (false);
-- Fix #12 + existing: REVOKE all modification rights on auditoria_log
REVOKE UPDATE, DELETE ON auditoria_log FROM PUBLIC;
REVOKE UPDATE, DELETE ON auditoria_log FROM authenticated;
REVOKE ALL ON auditoria_log FROM anon;                                           -- Fix #12: REVOKE INSERT from anon

DROP POLICY IF EXISTS "service_role_all" ON repartidores;
CREATE POLICY "deny_anon" ON repartidores FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated" ON repartidores FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "service_role_all" ON tarifas;
CREATE POLICY "deny_anon" ON tarifas FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated" ON tarifas FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "service_role_all" ON inventario_almacen;
CREATE POLICY "deny_anon" ON inventario_almacen FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated" ON inventario_almacen FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "service_role_all" ON movimientos_almacen;
CREATE POLICY "deny_anon" ON movimientos_almacen FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated" ON movimientos_almacen FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "service_role_all" ON picking_items;                       -- Fix #2: updated reference
CREATE POLICY "deny_anon" ON picking_items FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated" ON picking_items FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "service_role_all" ON configuracion;
CREATE POLICY "deny_anon" ON configuracion FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated" ON configuracion FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- ═══════════════════════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════════════════════

-- System configuration
INSERT INTO configuracion (key, value) VALUES
  ('empresa', '{"telefono": "+595 21 555 0000", "email": "info@goexpress.com.py", "direccion": "Asunción, Paraguay", "nombre": "GO EXPRESS"}'),
  ('notificaciones', '{"email_nuevo_envio": true, "email_cambio_estado": true, "email_entrega": true, "whatsapp_enabled": false}'),
  ('tracking_prefix', '"GE"'),
  ('tracking_year', '"2026"'),
  ('factor_dimensional', '5000')
ON CONFLICT (key) DO NOTHING;

-- Initial admin user
INSERT INTO usuarios (id, nombre, email, rol, estado) VALUES
  ('00000000-0000-4000-a000-000000000001', 'Admin GoExpress', 'admin@goexpress.com.py', 'admin', 'activo')
ON CONFLICT (id) DO NOTHING;
