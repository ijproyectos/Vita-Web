-- Vitapp — "Mis pastillas": stock restante por medicamento.
--
-- Un mismo medicamento tomado en varios momentos del día vive en VARIAS filas
-- de `medicamentos` (una por horario, ver `agregarMultiMomento`), sin ninguna
-- columna de agrupación. El stock tiene que ser UNO solo para todas ellas, así
-- que se modela como entidad aparte (`inventario_pastillas`) y cada fila de
-- `medicamentos` apunta a ella con `inventario_id`. Las filas hermanas se
-- identifican por (usuario_id, nombre, dosis) normalizados — el mismo criterio
-- que usa `claveMedicamento()` en lib/inventario/nucleo.ts; el índice único de
-- abajo lo hace cumplir también en la DB (un inventario por medicamento).
--
-- Escritura de stock:
--   - el dueño tiene CRUD directo vía `inventario_pastillas_all_self`;
--   - el cuidador vinculado tiene SELECT (para ver "quedan N") y descuenta
--     stock SOLO a través de `ajustar_stock_pastillas()` (security definer,
--     update atómico, chequea dueño o cuidador aceptado). No recibe UPDATE
--     directo: podría cambiar nombre/umbral/stock arbitrariamente.
--
-- Esta migración está escrita pero NO aplicada todavía (sin password de DB).

create table inventario_pastillas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,
  dosis text,
  stock int not null check (stock >= 0),
  pastillas_por_toma int not null default 1 check (pastillas_por_toma > 0),
  umbral_alerta int not null default 5 check (umbral_alerta >= 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Un solo inventario por medicamento (nombre+dosis normalizados) y usuario.
create unique index idx_inventario_unico on inventario_pastillas (
  usuario_id,
  lower(btrim(nombre)),
  lower(btrim(coalesce(dosis, '')))
);

create index idx_inventario_usuario on inventario_pastillas (usuario_id);

alter table medicamentos
  add column inventario_id uuid references inventario_pastillas(id) on delete set null;

create index idx_medicamentos_inventario on medicamentos (inventario_id)
  where inventario_id is not null;

-- RLS ----------------------------------------------------------------------

alter table inventario_pastillas enable row level security;

create policy inventario_pastillas_all_self on inventario_pastillas
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Lectura aditiva del cuidador sobre el stock del elder vinculado (mismo
-- criterio que medicamentos_select_cuidador, migración 008).
create policy inventario_pastillas_select_cuidador on inventario_pastillas
  for select using (usuario_id in (
    select v.elder_id from vinculos_cuidador v
    where v.cuidador_id = auth.uid() and v.estado = 'aceptado' and v.elder_id is not null
  ));

-- RPC ----------------------------------------------------------------------

-- Mueve el stock UNA toma (-1 = se tomó, +1 = se desmarcó) de forma atómica,
-- sin bajar nunca de 0: el delta real es p_direccion * pastillas_por_toma,
-- calculado acá y no recibido del cliente — así un cuidador (que no tiene
-- UPDATE directo) no puede fijar un stock arbitrario llamando a la RPC.
-- Devuelve el stock resultante. Autoriza al dueño del inventario o a un
-- cuidador con vínculo 'aceptado' hacia ese dueño; para cualquier otro
-- caller (o un id inexistente) no toca nada y devuelve null — no distingue
-- "no existe" de "no es tuyo" para no filtrar existencia.
create or replace function ajustar_stock_pastillas(p_inventario_id uuid, p_direccion int)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stock int;
begin
  if auth.uid() is null or p_direccion not in (-1, 1) then
    return null;
  end if;

  update inventario_pastillas ip
  set stock = greatest(0, ip.stock + p_direccion * ip.pastillas_por_toma),
      updated_at = now()
  where ip.id = p_inventario_id
    and (
      ip.usuario_id = auth.uid()
      or ip.usuario_id in (
        select v.elder_id from vinculos_cuidador v
        where v.cuidador_id = auth.uid() and v.estado = 'aceptado' and v.elder_id is not null
      )
    )
  returning ip.stock into v_stock;

  return v_stock; -- null si no se actualizó ninguna fila
end;
$$;

revoke execute on function ajustar_stock_pastillas(uuid, int) from public, anon;
-- (la firma sigue siendo (uuid, int): p_direccion es int)
grant execute on function ajustar_stock_pastillas(uuid, int) to authenticated;
