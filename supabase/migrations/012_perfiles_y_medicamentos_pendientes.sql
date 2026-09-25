-- Vitapp — Onboarding conversacional nuevo: el cuidador arma el perfil
-- (nombre/relación/edad) y los medicamentos de la persona que cuida ANTES
-- de que ella tenga cuenta real — recién al final se genera el código para
-- que lo sincronice en su dispositivo (a diferencia del flujo existente,
-- 010_*, donde el código se generaba primero y vacío).
--
-- Como `medicamentos.usuario_id` exige un `auth.users` real (NOT NULL FK),
-- no se puede escribir ahí todavía. Se staging-ea en dos tablas nuevas,
-- propiedad exclusiva del cuidador (RLS de solo su propio `cuidador_id`,
-- ningún acceso cruzado — no son visibles ni por la persona cuidada, que
-- todavía no existe como cuenta, ni por otro cuidador). Al reclamar el
-- código (`reclamar_vinculo_como_elder`, extendida acá) se migran a las
-- tablas reales con `usuario_id = auth.uid()` (la persona que recién
-- inició sesión) y se borran — no quedan datos huérfanos en las tablas de
-- borrador una vez reclamado.
--
-- No se agrega columna de color a `perfiles` ni a esta tabla nueva — la
-- pestaña de color por perfil (violeta para "Elsa", etc. en el diseño) se
-- deriva en el cliente con `colorChipPorIndice` (lib/perfil/tipos.ts, ya
-- existe), no hace falta persistirlo.

create table perfiles_pendientes (
  id uuid primary key default gen_random_uuid(),
  cuidador_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,
  relacion text, -- "Mamá" / "Papá" / "Abuela/o" / "Otro" — texto libre, sin catálogo cerrado
  edad int,
  -- Se completa recién cuando se genera el código para ESTE perfil
  -- puntual (un cuidador puede tener más de un perfil en borrador a la
  -- vez, ej. mamá y papá) — null mientras el cuidador sigue cargando
  -- medicamentos y todavía no llegó a la pantalla de vinculación.
  vinculo_id uuid references vinculos_cuidador(id) on delete set null,
  estado text not null check (estado in ('borrador', 'vinculado')) default 'borrador',
  created_at timestamptz not null default now()
);

create table medicamentos_pendientes (
  id uuid primary key default gen_random_uuid(),
  perfil_pendiente_id uuid not null references perfiles_pendientes(id) on delete cascade,
  nombre text not null,
  dosis text,
  unidad text not null default 'mg',
  hora_programada text not null, -- "HH:MM", mismo formato que medicamentos.hora_programada
  momento_dia text not null check (momento_dia in ('mañana', 'mediodia', 'tarde', 'noche')),
  con_comida text not null default 'no-importa' check (con_comida in ('antes', 'con', 'despues', 'no-importa')),
  frecuencia text,
  duracion text,
  notas text,
  created_at timestamptz not null default now()
);

alter table perfiles_pendientes enable row level security;
alter table medicamentos_pendientes enable row level security;

-- Dueño exclusivo: el cuidador que las creó. Nadie más las lee ni las
-- escribe — ni la persona cuidada (no existe como cuenta todavía) ni
-- ningún otro cuidador.
create policy perfiles_pendientes_all_propio on perfiles_pendientes
  for all using (cuidador_id = auth.uid()) with check (cuidador_id = auth.uid());

create policy medicamentos_pendientes_all_propio on medicamentos_pendientes
  for all using (perfil_pendiente_id in (
    select id from perfiles_pendientes where cuidador_id = auth.uid()
  )) with check (perfil_pendiente_id in (
    select id from perfiles_pendientes where cuidador_id = auth.uid()
  ));

-- reclamar_vinculo_como_elder — extendida: además de aceptar el vínculo,
-- si existe un perfil pendiente asociado a este código (`vinculo_id`),
-- migra sus medicamentos_pendientes a `medicamentos` reales con
-- usuario_id = auth.uid() (la persona que recién los está reclamando) y
-- borra el borrador. `security definer`, así que puede leer
-- perfiles_pendientes/medicamentos_pendientes del cuidador (cuya RLS
-- normal no lo permitiría desde la sesión del elder) sin bypass manual de
-- RLS en el código de la aplicación.
create or replace function reclamar_vinculo_como_elder(p_codigo text)
returns table (cuidador_id uuid, nombre text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vinculo vinculos_cuidador%rowtype;
  v_perfil_pendiente perfiles_pendientes%rowtype;
begin
  select * into v_vinculo
  from vinculos_cuidador vc
  where vc.codigo = p_codigo and vc.estado = 'pendiente' and vc.elder_id is null
  for update;

  if not found then
    raise exception 'codigo_no_encontrado';
  end if;

  if v_vinculo.expira_at < now() then
    raise exception 'codigo_expirado';
  end if;

  if exists (
    select 1 from vinculos_cuidador vc
    where vc.elder_id = auth.uid() and vc.cuidador_id = v_vinculo.cuidador_id and vc.estado = 'aceptado'
  ) then
    raise exception 'ya_vinculado';
  end if;

  update vinculos_cuidador
  set elder_id = auth.uid(), estado = 'aceptado', aceptado_at = now()
  where id = v_vinculo.id;

  select * into v_perfil_pendiente
  from perfiles_pendientes pp
  where pp.vinculo_id = v_vinculo.id and pp.estado = 'borrador';

  if found then
    insert into medicamentos (
      usuario_id, nombre, dosis, unidad, hora_programada, momento_dia,
      con_comida, frecuencia, duracion, notas
    )
    select
      auth.uid(), mp.nombre, mp.dosis, mp.unidad, mp.hora_programada, mp.momento_dia,
      mp.con_comida, mp.frecuencia, mp.duracion, mp.notas
    from medicamentos_pendientes mp
    where mp.perfil_pendiente_id = v_perfil_pendiente.id;

    delete from medicamentos_pendientes where perfil_pendiente_id = v_perfil_pendiente.id;

    update perfiles_pendientes set estado = 'vinculado' where id = v_perfil_pendiente.id;
  end if;

  return query
  select p.id as cuidador_id, p.nombre as nombre
  from perfiles p
  where p.id = v_vinculo.cuidador_id;
end;
$$;
