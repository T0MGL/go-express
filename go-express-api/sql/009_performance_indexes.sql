-- Performance indexes for frequent query patterns identified during audit

-- pagos: fecha_pago used by stats (cobrado_hoy filter)
CREATE INDEX IF NOT EXISTS idx_pagos_fecha_pago ON pagos(fecha_pago) WHERE estado_pago = 'pagado';

-- inventario_almacen: fecha_ingreso and fecha_salida used by warehouse stats
CREATE INDEX IF NOT EXISTS idx_inventario_fecha_ingreso ON inventario_almacen(fecha_ingreso);
CREATE INDEX IF NOT EXISTS idx_inventario_fecha_salida ON inventario_almacen(fecha_salida) WHERE estado_almacen = 'despachado';

-- envios: composite for client portal dashboard (cliente_id + eliminado + estado)
CREATE INDEX IF NOT EXISTS idx_envios_cliente_eliminado ON envios(cliente_id, eliminado) WHERE eliminado = FALSE;

-- envios: fecha + eliminado for admin dashboard (enviosHoy, recientes)
CREATE INDEX IF NOT EXISTS idx_envios_fecha_eliminado ON envios(fecha, eliminado) WHERE eliminado = FALSE;

-- clientes: auth_id lookup (used on every portal login and auth check)
CREATE INDEX IF NOT EXISTS idx_clientes_auth_id ON clientes(auth_id) WHERE auth_id IS NOT NULL;

-- usuarios: auth_id lookup (used on every admin auth check)
CREATE INDEX IF NOT EXISTS idx_usuarios_auth_id ON usuarios(auth_id) WHERE auth_id IS NOT NULL;
