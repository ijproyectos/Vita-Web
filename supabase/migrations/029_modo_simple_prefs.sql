-- Vitapp — V7 paquete 9: Configurar modo simple.
--
-- Escrita pero NO aplicada. Requisitos previos: 020 (posposiciones) y 021
-- (es_cuidador_de / puede_editar_de).
--
-- preferencias_modo_simple: cómo ve la PERSONA su pantalla de modo simple. La
-- fila es de la persona (PK = usuario_id = la persona cuidada); la configura
-- ella o un cuidador Admin (rol 'editar'). Sin fila = defaults del código
-- (lib/modo-simple/tipos.ts): todo visible, voz normal, "Más tarde" a 15 min,
-- ayuda al contacto de emergencia del perfil.
--
--   ver_turnos, ver_mediciones, charlar, ayuda   qué secciones/botones se ven
--   voz, voz_lenta                               leerle los avisos / más despacio
--   posponer, posponer_min                       "Más tarde" on/off y 15/30/60
--   llamar_nombre, llamar_telefono               a quién llama el botón Ayuda; null =
--                                                su contacto de emergencia (perfiles).
--                                                Es una COPIA hecha por quien configura
--                                                (p. ej. "Mica" con su propio teléfono):
--                                                la persona no puede leer el perfil de
--                                                su cuidador, así que no se guarda una
--                                                referencia.
--
-- RLS: la persona (dueña) lo hace todo; un cuidador aceptado lo lee; solo uno
-- con rol 'editar' lo crea o modifica. Nadie borra (volver a defaults = update).
--
-- Sin esta migración la app degrada: la pantalla de la persona usa los
-- defaults y Configurar modo simple muestra el aviso de "todavía no disponible".

create table if not exists preferencias_modo_simple (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  ver_turnos boolean not null default true,
  ver_mediciones boolean not null default true,
  charlar boolean not null default true,
  ayuda boolean not null default true,
  voz boolean not null default true,
  voz_lenta boolean not null default false,
  posponer boolean not null default true,
  posponer_min integer not null default 15 check (posponer_min in (15, 30, 60)),
  llamar_nombre text check (llamar_nombre is null or char_length(llamar_nombre) <= 80),
  llamar_telefono text check (llamar_telefono is null or char_length(llamar_telefono) <= 40),
  -- o ambos o ninguno: un nombre sin teléfono (o al revés) no sirve para llamar
  check ((llamar_nombre is null) = (llamar_telefono is null)),
  updated_at timestamptz not null default now()
);

alter table preferencias_modo_simple enable row level security;

drop policy if exists pms_all_self on preferencias_modo_simple;
create policy pms_all_self on preferencias_modo_simple
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

drop policy if exists pms_select_cuidador on preferencias_modo_simple;
create policy pms_select_cuidador on preferencias_modo_simple
  for select using (es_cuidador_de(usuario_id));

drop policy if exists pms_insert_cuidador on preferencias_modo_simple;
create policy pms_insert_cuidador on preferencias_modo_simple
  for insert with check (puede_editar_de(usuario_id));

drop policy if exists pms_update_cuidador on preferencias_modo_simple;
create policy pms_update_cuidador on preferencias_modo_simple
  for update using (puede_editar_de(usuario_id)) with check (puede_editar_de(usuario_id));
