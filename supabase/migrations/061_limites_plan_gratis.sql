-- Vitapp — límites del plan gratis (cuentas SIN vita+).
--
-- Nota: escrita pero NO aplicada. Aplicar a mano con `psql -1 -f` (no `db push`) y registrar en schema_migrations.
-- Requiere 021/027 (familia, cuidadores), 044/046 (vita_plus_vigencia con `permanente`) y 049 (límite de interacciones).
--
-- Decisión del dueño (2026-11-15). Si la persona NO tiene vita+:
--   1. Chat con vita: máximo 5 respuestas por día (se combina con el límite de 049: gratis = min(5, el configurado)).
--   2. Conteo de pastillas con foto (IA): 1 por mes calendario (Argentina). La carga manual no tiene tope.
--   3. Estudios médicos: 1 por mes calendario (Argentina), contados desde `estudios` (no hay tabla nueva).
--   4. Cuidadores: 1 por persona en total (aceptados + invitaciones pendientes vigentes; no cuentan los revocados).
--
-- Quién cuenta como "vita+" para las reglas 2, 3 y 4 (`es_vita_plus_de`): la propia persona O cualquiera de sus
-- cuidadores ACEPTADOS con rol 'editar' (Admin). Así un perfil gestionado (que no puede pagar) queda cubierto por el
-- vita+ de quien lo administra. La regla 1 (chat) mira solo la cuenta que chatea (se resuelve en la app).
--
-- Qué agrega:
--   * usos_funciones: registro de usos de funciones con costo (hoy solo 'contar_pastillas'). RLS: la persona lee los
--     suyos; sin policies de escritura (se escribe con la RPC registrar_uso_funcion).
--   * es_vita_plus_de(uuid): ver arriba. SECURITY DEFINER, search_path vacío. Un usuario autenticado solo puede
--     preguntar por sí mismo o por una persona de la que es cuidador aceptado (si no, responde false: no es un oráculo).
--   * registrar_uso_funcion / usos_funcion_mes: escribir y contar el mes en curso (Argentina) de una persona; solo
--     ella o un cuidador con rol 'editar'.
--   * cupo_cuidadores(uuid): para la pantalla de invitar (plan y cuántos cuidadores cuentan hoy).
--   * Trigger bloquear_exceso_cuidadores en vinculos_cuidador: es el cierre a nivel base de datos. Cubre invitar_cuidador,
--     el insert directo del elder (policy vinculos_all_elder), reclamar_vinculo_como_elder (el código iniciado por un
--     cuidador fija elder_id al reclamarlo) y la reactivación de un vínculo revocado. NO se dispara al aceptar una
--     invitación (reclamar_invitacion_cuidador: la fila pendiente ya contaba) ni al reemitir una invitación al mismo
--     mail. La primera fila de un perfil gestionado (el creador) siempre entra: ese perfil no tiene ninguna otra.
--     Las personas que ya tienen más de un cuidador los conservan: el trigger solo mira altas nuevas.
--     Error: `limite_cuidadores` (la app lo traduce a un mensaje).
--     asignar_codigo_invitacion no crea vínculos (solo pone el código a una fila que invitar_cuidador ya validó), así
--     que no necesita su propio chequeo.
--   * consumir_interaccion / interacciones_hoy ganan `p_tope` (opcional): tope adicional para cuentas gratis; el
--     efectivo es least(límite configurado o general, p_tope). Se reemplazan las firmas de 049 (mismos grants).
--
-- Degradación: sin esta migración la app NO bloquea a nadie por estos límites (falla abierto, con un warning en el
-- log); el chat sigue con el comportamiento de 049.
-- Rollback:
--   drop trigger if exists bloquear_exceso_cuidadores on public.vinculos_cuidador;
--   drop function if exists public.bloquear_exceso_cuidadores(), public.cupo_cuidadores(uuid),
--     public.usos_funcion_mes(uuid, text), public.registrar_uso_funcion(uuid, text), public.es_vita_plus_de(uuid),
--     public._plan_plus_de(uuid);
--   drop table if exists public.usos_funciones;
--   -- y volver a crear consumir_interaccion / interacciones_hoy de 049 (3 argumentos).

do $$
begin
  if to_regclass('public.limites_interacciones') is null then
    raise exception 'limites_plan_gratis: falta la migración 049 (limites_interacciones)';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vita_plus_vigencia' and column_name = 'permanente'
  ) then
    raise exception 'limites_plan_gratis: falta la migración 046 (vita_plus_vigencia.permanente)';
  end if;
end;
$$;

-- 1 · ¿Tiene vita+ la persona o algún Admin que la cuida? ------------------------------------------------------

-- Núcleo sin chequeo de quién pregunta: solo lo usan el trigger y el envoltorio de abajo.
create or replace function public._plan_plus_de(p_persona uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_persona is not null and (
    exists (
      select 1 from public.vita_plus_vigencia v
      where v.usuario_id = p_persona and (v.permanente or v.vence_at > now())
    )
    or exists (
      select 1
      from public.vinculos_cuidador vc
      join public.vita_plus_vigencia v on v.usuario_id = vc.cuidador_id
      where vc.elder_id = p_persona
        and vc.estado = 'aceptado'
        and vc.rol = 'editar'
        and vc.cuidador_id <> vc.elder_id
        and (v.permanente or v.vence_at > now())
    )
  );
$$;

revoke all on function public._plan_plus_de(uuid) from public, anon, authenticated;

create or replace function public.es_vita_plus_de(p_persona uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_persona is null then false
    -- Sin sesión (service_role, trigger de sistema): se responde directo. Con sesión: solo sobre uno mismo o sobre
    -- una persona de la que es cuidador aceptado.
    when auth.uid() is not null
         and auth.uid() <> p_persona
         and not exists (
           select 1 from public.vinculos_cuidador vc
           where vc.elder_id = p_persona and vc.cuidador_id = auth.uid() and vc.estado = 'aceptado'
         )
      then false
    else public._plan_plus_de(p_persona)
  end;
$$;

revoke all on function public.es_vita_plus_de(uuid) from public, anon;
grant execute on function public.es_vita_plus_de(uuid) to authenticated, service_role;

-- 2 · Usos de funciones con costo (conteo de pastillas por foto) ------------------------------------------------

create table if not exists public.usos_funciones (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references auth.users (id) on delete cascade, -- la persona a la que pertenece el dato
  funcion text not null check (funcion in ('contar_pastillas')),
  created_at timestamptz not null default now()
);

create index if not exists usos_funciones_usuario_idx on public.usos_funciones (usuario_id, funcion, created_at desc);

alter table public.usos_funciones enable row level security;
revoke all on table public.usos_funciones from public, anon, authenticated;
grant select on table public.usos_funciones to authenticated;
grant select, insert, delete on table public.usos_funciones to service_role;

drop policy if exists usos_funciones_select_propio on public.usos_funciones;
create policy usos_funciones_select_propio on public.usos_funciones
  for select to authenticated using (usuario_id = auth.uid());

-- Inicio del mes calendario en Argentina (UTC-3 fijo, sin horario de verano), como instante.
create or replace function public._inicio_mes_ar()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires';
$$;

revoke all on function public._inicio_mes_ar() from public, anon;
grant execute on function public._inicio_mes_ar() to authenticated, service_role;

-- Solo la persona o un cuidador Admin puede registrar / consultar. true = registrado.
create or replace function public.registrar_uso_funcion(p_persona uuid, p_funcion text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_persona is null or p_funcion is distinct from 'contar_pastillas' then
    return false;
  end if;
  if auth.uid() <> p_persona and not public.puede_editar_de(p_persona) then
    return false;
  end if;
  insert into public.usos_funciones (usuario_id, funcion) values (p_persona, p_funcion);
  return true;
end;
$$;

-- Usos del mes en curso (Argentina). null = sin permiso sobre esa persona.
create or replace function public.usos_funcion_mes(p_persona uuid, p_funcion text)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_persona is null then
    return null;
  end if;
  if auth.uid() <> p_persona and not public.puede_editar_de(p_persona) then
    return null;
  end if;
  return (
    select count(*)::int from public.usos_funciones u
    where u.usuario_id = p_persona and u.funcion = p_funcion and u.created_at >= public._inicio_mes_ar()
  );
end;
$$;

revoke all on function public.registrar_uso_funcion(uuid, text), public.usos_funcion_mes(uuid, text) from public, anon;
grant execute on function public.registrar_uso_funcion(uuid, text), public.usos_funcion_mes(uuid, text) to authenticated, service_role;

-- 3 · Cuidadores: cuántos cuentan hoy y cierre a nivel base ------------------------------------------------------

-- Cuenta aceptados + pendientes vigentes (una invitación vencida no ocupa el lugar). `p_excluir` = fila que se está
-- dando de alta o reclamando.
create or replace function public._cuidadores_que_cuentan(p_persona uuid, p_excluir uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.vinculos_cuidador vc
  where vc.elder_id = p_persona
    and vc.estado <> 'revocado'
    and not (vc.estado = 'pendiente' and vc.expira_at < now())
    and (p_excluir is null or vc.id <> p_excluir);
$$;

revoke all on function public._cuidadores_que_cuentan(uuid, uuid) from public, anon, authenticated;

create or replace function public.cupo_cuidadores(p_persona uuid)
returns table (c_plus boolean, c_usados int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_persona is null then
    return;
  end if;
  if auth.uid() <> p_persona and not public.puede_editar_de(p_persona) then
    return;
  end if;
  return query select public._plan_plus_de(p_persona), public._cuidadores_que_cuentan(p_persona, null);
end;
$$;

revoke all on function public.cupo_cuidadores(uuid) from public, anon;
grant execute on function public.cupo_cuidadores(uuid) to authenticated, service_role;

create or replace function public.bloquear_exceso_cuidadores()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alta boolean;
begin
  if new.elder_id is null or new.estado = 'revocado' then
    return new; -- código iniciado por un cuidador, todavía sin persona; o baja
  end if;

  if tg_op = 'INSERT' then
    v_alta := true;
  else
    -- Reclamo de un código (elder_id pasa de null a una persona) o reactivación de un vínculo revocado.
    v_alta := old.elder_id is null or old.estado = 'revocado';
  end if;
  if not v_alta then
    return new;
  end if;

  -- Con vita+ (de la persona o de un Admin que la cuida) no hay tope.
  if public._plan_plus_de(new.elder_id) then
    return new;
  end if;
  if public._cuidadores_que_cuentan(new.elder_id, new.id) >= 1 then
    raise exception 'limite_cuidadores';
  end if;
  return new;
end;
$$;

revoke all on function public.bloquear_exceso_cuidadores() from public, anon, authenticated;

drop trigger if exists bloquear_exceso_cuidadores on public.vinculos_cuidador;
create trigger bloquear_exceso_cuidadores
  before insert or update of elder_id, estado on public.vinculos_cuidador
  for each row execute function public.bloquear_exceso_cuidadores();

-- 4 · Chat: tope adicional para cuentas gratis -------------------------------------------------------------------
-- p_tope null = sin tope extra (vita+). Efectivo = least(override de la persona o p_limite, p_tope).

drop function if exists public.consumir_interaccion(uuid, date, int);
drop function if exists public.interacciones_hoy(uuid, date, int);

create function public.consumir_interaccion(p_usuario uuid, p_fecha date, p_limite int default 15, p_tope int default null)
returns table (c_permitido boolean, c_usadas int, c_limite int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limite int;
  v_cuenta int;
begin
  select coalesce(
    (select l.limite_diario from public.limites_interacciones l where l.usuario_id = p_usuario),
    p_limite
  ) into v_limite;
  if v_limite is not null and p_tope is not null and p_tope >= 1 then
    v_limite := least(v_limite, p_tope);
  end if;
  if v_limite is null or v_limite < 1 then
    return query select false, 0, 0;
    return;
  end if;

  insert into public.interacciones_diarias as i (usuario_id, fecha, cuenta)
  values (p_usuario, p_fecha, 1)
  on conflict (usuario_id, fecha) do update
    set cuenta = i.cuenta + 1, updated_at = now()
    where i.cuenta < v_limite
  returning i.cuenta into v_cuenta;

  if v_cuenta is not null then
    return query select true, v_cuenta, v_limite;
    return;
  end if;

  select i.cuenta into v_cuenta from public.interacciones_diarias i where i.usuario_id = p_usuario and i.fecha = p_fecha;
  return query select false, coalesce(v_cuenta, 0), v_limite;
end;
$$;

create function public.interacciones_hoy(p_usuario uuid, p_fecha date, p_limite int default 15, p_tope int default null)
returns table (h_usadas int, h_limite int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select i.cuenta from public.interacciones_diarias i where i.usuario_id = p_usuario and i.fecha = p_fecha), 0),
    case
      when p_tope is not null and p_tope >= 1
        then least(coalesce((select l.limite_diario from public.limites_interacciones l where l.usuario_id = p_usuario), p_limite), p_tope)
      else coalesce((select l.limite_diario from public.limites_interacciones l where l.usuario_id = p_usuario), p_limite)
    end;
$$;

revoke all on function public.consumir_interaccion(uuid, date, int, int), public.interacciones_hoy(uuid, date, int, int) from public, anon, authenticated;
grant execute on function public.consumir_interaccion(uuid, date, int, int), public.interacciones_hoy(uuid, date, int, int) to service_role;
