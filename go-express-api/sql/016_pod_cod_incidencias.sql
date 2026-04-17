-- 013_pod_cod_incidencias.sql
-- Columns for proof of delivery, cash-on-delivery tracking and incidents.

alter table envios
  add column if not exists foto_entrega_url text,
  add column if not exists entregado_por_nombre text,
  add column if not exists entregado_por_documento text,
  add column if not exists fecha_entrega_real timestamptz,
  add column if not exists monto_cobrado bigint,
  add column if not exists recolectado_en timestamptz,
  add column if not exists entrega_notas text,
  add column if not exists tiene_incidencia boolean not null default false,
  add column if not exists incidencia_nota text,
  add column if not exists incidencia_reportada_en timestamptz,
  add column if not exists incidencia_reportada_por uuid references repartidores(id);

create index if not exists idx_envios_repartidor_fecha_entrega
  on envios (repartidor_id, fecha_entrega_real desc)
  where eliminado = false;

create index if not exists idx_envios_incidencia
  on envios (tiene_incidencia, created_at desc)
  where tiene_incidencia = true and eliminado = false;

comment on column envios.foto_entrega_url is 'Supabase Storage path (pod-entregas bucket) relative to envio_id.';
comment on column envios.monto_cobrado is 'Monto efectivo cobrado al destinatario en COD. Puede diferir de monto_a_cobrar.';
comment on column envios.tiene_incidencia is 'Flag que el repartidor activa al reportar un incidente. No cambia estado principal.';
