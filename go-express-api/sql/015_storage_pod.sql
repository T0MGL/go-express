-- 015_storage_pod.sql
-- Private Supabase Storage bucket for proof-of-delivery photos.
-- Convention: object path = "${envio_id}/pod_${timestamp}.webp"

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pod-entregas',
  'pod-entregas',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public = false;

-- Repartidor can upload POD only for envios assigned to them.
drop policy if exists "repartidor_upload_pod" on storage.objects;
create policy "repartidor_upload_pod" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pod-entregas'
    and exists (
      select 1
      from envios e
      join repartidores r on r.id = e.repartidor_id
      where e.id::text = split_part(name, '/', 1)
        and r.auth_id = auth.uid()
        and r.estado = 'activo'
        and r.eliminado = false
        and e.eliminado = false
    )
  );

-- Admin and operador can read any POD.
drop policy if exists "staff_read_pod" on storage.objects;
create policy "staff_read_pod" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pod-entregas'
    and exists (
      select 1 from usuarios
      where auth_id = auth.uid()
        and rol in ('admin', 'operador')
        and estado = 'activo'
    )
  );

-- Corporate client can read POD of their own envios.
drop policy if exists "cliente_read_own_pod" on storage.objects;
create policy "cliente_read_own_pod" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pod-entregas'
    and exists (
      select 1
      from envios e
      join clientes c on c.id = e.cliente_id
      where e.id::text = split_part(name, '/', 1)
        and c.auth_id = auth.uid()
        and c.eliminado = false
    )
  );

-- Repartidor can read POD they uploaded (to verify after save).
drop policy if exists "repartidor_read_own_pod" on storage.objects;
create policy "repartidor_read_own_pod" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pod-entregas'
    and exists (
      select 1
      from envios e
      join repartidores r on r.id = e.repartidor_id
      where e.id::text = split_part(name, '/', 1)
        and r.auth_id = auth.uid()
    )
  );
