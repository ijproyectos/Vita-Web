-- 016 — Bloquear el autovínculo (cuidador reclamando su propio código).
--
-- Bug real en prod: un usuario generó un código como cuidador y lo reclamó
-- él mismo, produciendo una fila con cuidador_id = elder_id.
--
-- 1) reclamar_vinculo_como_elder: misma firma, mismo shape y mismo
--    comportamiento que la definición de 012, más un chequeo nuevo que
--    rechaza con `autovinculo_no_permitido` (mismo mecanismo que los demás
--    rechazos: `raise exception '<motivo>'`, que el TS mapea por
--    error.message). Todas las columnas siguen calificadas con alias
--    (ver 011: `returns table` expone variables OUT).
-- 2) CHECK cuidador_id is distinct from elder_id como defensa en
--    profundidad. NOT VALID: no revisa las filas existentes (hay UNA fila
--    autovinculada, id 4c9b998d...; el parent decide qué hacer con ella y
--    luego puede correr `alter table vinculos_cuidador validate constraint
--    vinculos_sin_autovinculo`). Igual se aplica a todo INSERT/UPDATE nuevo.

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

  if v_vinculo.cuidador_id = auth.uid() then
    raise exception 'autovinculo_no_permitido';
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

revoke execute on function reclamar_vinculo_como_elder(text) from public, anon;
grant execute on function reclamar_vinculo_como_elder(text) to authenticated;

alter table vinculos_cuidador
  add constraint vinculos_sin_autovinculo
  check (cuidador_id is null or elder_id is null or cuidador_id <> elder_id) not valid;
