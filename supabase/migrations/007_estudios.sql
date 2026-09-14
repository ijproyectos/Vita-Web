-- Vitapp — estudios médicos, cargados por cámara/galería con extracción
-- automática por IA (lib/estudios/extraer.ts). Tabla + bucket de Storage
-- privado, mismo patrón que los buckets privados de NutrIA
-- (laboratorios/chat-adjuntos): path "{usuario_id}/{archivo}", policies de
-- storage.objects que exigen que el primer segmento del path matchee al
-- usuario autenticado.

create table estudios (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  tipo text, -- "Análisis de sangre", "Radiografía de tórax"... — null si la extracción falló
  fecha date, -- solo si es visible en la imagen
  resumen text,
  valores jsonb not null default '[]', -- [{nombre, valor}]
  archivo_path text not null, -- path dentro del bucket "estudios"
  archivo_tipo text not null, -- mime type
  estado text not null check (estado in ('listo', 'error')) default 'listo',
  created_at timestamptz not null default now()
);

create index idx_estudios_usuario on estudios(usuario_id, created_at desc);

alter table estudios enable row level security;

create policy estudios_all_self on estudios
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Storage: bucket privado, un usuario solo puede tocar su propia carpeta.
insert into storage.buckets (id, name, public) values ('estudios', 'estudios', false);

create policy estudios_storage_select_self on storage.objects
  for select using (bucket_id = 'estudios' and (storage.foldername(name))[1] = auth.uid()::text);

create policy estudios_storage_insert_self on storage.objects
  for insert with check (bucket_id = 'estudios' and (storage.foldername(name))[1] = auth.uid()::text);

create policy estudios_storage_delete_self on storage.objects
  for delete using (bucket_id = 'estudios' and (storage.foldername(name))[1] = auth.uid()::text);
